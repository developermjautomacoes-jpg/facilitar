#!/usr/bin/env python3
"""
Transcritor das reuniões do sistema Facilitar.

Roda em segundo plano (iniciado pelo api.php) e transcreve os arquivos parte-NNNN.<ext> de cada
reunião em DADOS_DIR/reunioes/<id>/, gravando parte-NNNN.json com os trechos e horários.

Motores:
  - Groq (whisper-large-v3-turbo), se a variável GROQ_API_KEY vier preenchida: leva segundos por parte.
  - Whisper no próprio servidor (faster-whisper), sempre disponível: se o Groq falhar ou atingir o limite,
    a parte é transcrita aqui mesmo.
Só um transcritor roda por vez (trava em .transcritor.lock). Ele espera novas partes por ~90 s e sai.
"""
import fcntl
import glob
import io
import json
import os
import sys
import time
import urllib.error
import urllib.request
import uuid
import wave

BASE = sys.argv[1] if len(sys.argv) > 1 else "/data/reunioes"
GROQ = os.environ.get("GROQ_API_KEY", "").strip()
GROQ_MODELO = os.environ.get("GROQ_MODELO", "whisper-large-v3-turbo")
MODELO_LOCAL = os.environ.get("WHISPER_MODELO", "/opt/whisper/small")
THREADS = int(os.environ.get("WHISPER_THREADS", "2"))
BEAM = int(os.environ.get("WHISPER_BEAM", "1"))
ESPERA_MAX = 90  # segundos sem partes novas antes de encerrar
EXTS = (".webm", ".ogg", ".mp3", ".m4a", ".wav", ".mp4", ".aac", ".opus", ".mpeg")
PROMPT_BASE = ("Reunião da Facilitar Serviços Contábeis, em português do Brasil. "
               "Termos: Simples Nacional, Lucro Presumido, ICMS, ISS, PIS, COFINS, IRPJ, CSLL, DCTFWeb, eSocial, "
               "EFD-Reinf, SPED, DAS, Domínio, IBS, CBS.")

_modelo = None
_groq_pausado_ate = 0.0


def log(msg):
    print(time.strftime("%H:%M:%S"), msg, flush=True)


def pendentes():
    """Partes ainda sem .json/.erro, das reuniões mais antigas para as mais novas."""
    fila = []
    for d in sorted(glob.glob(os.path.join(BASE, "r*"))):
        for f in sorted(glob.glob(os.path.join(d, "parte-*"))):
            raiz, ext = os.path.splitext(f)
            if ext.lower() not in EXTS:
                continue
            if os.path.exists(raiz + ".json") or os.path.exists(raiz + ".erro"):
                continue
            fila.append(f)
    return fila


def prompt_da(pasta):
    try:
        with open(os.path.join(pasta, "meta.json"), encoding="utf-8") as fh:
            meta = json.load(fh)
        nomes = ", ".join(meta.get("participantes") or [])[:300]
        titulo = (meta.get("titulo") or "")[:150]
        extra = (" Assunto: " + titulo + "." if titulo else "") + (" Participantes: " + nomes + "." if nomes else "")
        return PROMPT_BASE + extra
    except Exception:
        return PROMPT_BASE


def audio_16k(arquivo):
    """Decodifica qualquer formato (webm/opus, mp3, m4a...) para float32 mono 16 kHz."""
    from faster_whisper.audio import decode_audio
    return decode_audio(arquivo, sampling_rate=16000)


def wav_bytes(amostras):
    import numpy as np
    pcm = (np.clip(amostras, -1, 1) * 32767).astype("<i2").tobytes()
    buf = io.BytesIO()
    with wave.open(buf, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(16000)
        w.writeframes(pcm)
    return buf.getvalue()


class LimiteGroq(Exception):
    pass


def groq_trecho(dados_wav, prompt):
    limite = "----facilitar" + uuid.uuid4().hex
    campos = {"model": GROQ_MODELO, "language": "pt", "response_format": "verbose_json", "temperature": "0", "prompt": prompt[:800]}
    corpo = io.BytesIO()
    for k, v in campos.items():
        corpo.write(f"--{limite}\r\nContent-Disposition: form-data; name=\"{k}\"\r\n\r\n{v}\r\n".encode())
    corpo.write(f"--{limite}\r\nContent-Disposition: form-data; name=\"file\"; filename=\"audio.wav\"\r\nContent-Type: audio/wav\r\n\r\n".encode())
    corpo.write(dados_wav)
    corpo.write(f"\r\n--{limite}--\r\n".encode())
    req = urllib.request.Request("https://api.groq.com/openai/v1/audio/transcriptions", data=corpo.getvalue(), method="POST",
                                 headers={"Authorization": "Bearer " + GROQ, "Content-Type": "multipart/form-data; boundary=" + limite,
                                          "User-Agent": "Facilitar-Reunioes/1.0"})
    try:
        with urllib.request.urlopen(req, timeout=120) as r:
            return json.loads(r.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        if e.code == 429:
            espera = float(e.headers.get("retry-after") or 60)
            raise LimiteGroq(espera)
        raise RuntimeError(f"Groq HTTP {e.code}: {e.read()[:200]!r}")


def transcrever_groq(arquivo, prompt):
    """Envia em blocos de até 10 min (WAV 16 kHz ≈ 19 MB, abaixo do limite de 25 MB do Groq)."""
    amostras = audio_16k(arquivo)
    bloco = 16000 * 600
    segs = []
    for ini in range(0, max(len(amostras), 1), bloco):
        pedaco = amostras[ini:ini + bloco]
        if len(pedaco) < 1600:  # menos de 0,1 s
            continue
        r = groq_trecho(wav_bytes(pedaco), prompt)
        desloc = ini / 16000
        for s in r.get("segments") or []:
            txt = (s.get("text") or "").strip()
            # descarta trechos que o modelo marcou como provável silêncio/ruído
            if not txt or (s.get("no_speech_prob", 0) > 0.8 and s.get("avg_logprob", 0) < -1):
                continue
            segs.append({"ini": round(desloc + float(s.get("start", 0)), 1), "fim": round(desloc + float(s.get("end", 0)), 1), "texto": txt})
        if not r.get("segments") and (r.get("text") or "").strip():
            segs.append({"ini": round(desloc, 1), "fim": round(desloc + len(pedaco) / 16000, 1), "texto": r["text"].strip()})
    return segs, len(amostras) / 16000


def transcrever_local(arquivo, prompt):
    global _modelo
    if _modelo is None:
        from faster_whisper import WhisperModel
        log(f"carregando modelo local {MODELO_LOCAL}")
        _modelo = WhisperModel(MODELO_LOCAL, device="cpu", compute_type="int8", cpu_threads=THREADS)
    segmentos, info = _modelo.transcribe(arquivo, language="pt", vad_filter=True, beam_size=BEAM,
                                         initial_prompt=prompt, condition_on_previous_text=False)
    segs = [{"ini": round(s.start, 1), "fim": round(s.end, 1), "texto": s.text.strip()} for s in segmentos if s.text.strip()]
    return segs, info.duration


def gravar(caminho, dados):
    tmp = caminho + ".tmp"
    with open(tmp, "w", encoding="utf-8") as fh:
        json.dump(dados, fh, ensure_ascii=False)
    os.replace(tmp, caminho)


def processar(arquivo):
    global _groq_pausado_ate
    raiz = os.path.splitext(arquivo)[0]
    prompt = prompt_da(os.path.dirname(arquivo))
    inicio = time.time()
    motor = "local"
    segs = dur = None
    if GROQ and time.time() >= _groq_pausado_ate:
        try:
            segs, dur = transcrever_groq(arquivo, prompt)
            motor = "groq"
        except LimiteGroq as e:
            espera = float(e.args[0])
            log(f"limite do Groq; {espera:.0f}s")
            if espera <= 30:
                time.sleep(espera)
                return False  # tenta de novo na próxima volta
            _groq_pausado_ate = time.time() + espera
        except Exception as e:  # rede, chave revogada etc.: segue no servidor
            log(f"Groq falhou ({e}); usando Whisper local")
            _groq_pausado_ate = time.time() + 120
    if segs is None:
        segs, dur = transcrever_local(arquivo, prompt)
    gravar(raiz + ".json", {"segmentos": segs, "duracao": round(dur or 0, 1), "motor": motor, "segundos": round(time.time() - inicio, 1)})
    log(f"{os.path.basename(os.path.dirname(arquivo))}/{os.path.basename(arquivo)}: {len(segs)} trechos via {motor} em {time.time() - inicio:.1f}s")
    return True


def main():
    os.makedirs(BASE, exist_ok=True)
    trava = open(os.path.join(BASE, ".transcritor.lock"), "w")
    try:
        fcntl.flock(trava, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except BlockingIOError:
        return  # já existe um transcritor rodando
    ocioso_desde = time.time()
    tentativas = {}
    while True:
        fila = pendentes()
        if not fila:
            if time.time() - ocioso_desde > ESPERA_MAX:
                break
            time.sleep(3)
            continue
        ocioso_desde = time.time()
        arquivo = fila[0]
        try:
            processar(arquivo)
        except Exception as e:
            tentativas[arquivo] = tentativas.get(arquivo, 0) + 1
            log(f"erro em {arquivo}: {e}")
            if tentativas[arquivo] >= 2:
                with open(os.path.splitext(arquivo)[0] + ".erro", "w", encoding="utf-8") as fh:
                    fh.write(f"Não foi possível transcrever esta parte: {str(e)[:300]}")
            else:
                time.sleep(2)


if __name__ == "__main__":
    main()
