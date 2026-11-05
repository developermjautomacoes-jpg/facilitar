import type { Colaborador } from "@/types";
import { chamarApi } from "./http";

export async function listarColaboradores(): Promise<Colaborador[]> {
  const r = await chamarApi<{ colaboradores: Colaborador[] }>("colabs");
  return r.colaboradores ?? [];
}
