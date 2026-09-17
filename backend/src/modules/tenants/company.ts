// Empresa "completa" = documento + endereço mínimos para emitir nota.
// numero/complemento/IM/telefone/e-mail ficam opcionais (endereços sem
// número existem; IM varia por município).
export interface CompanyLike {
  cnpj: string | null
  cep: string | null
  logradouro: string | null
  bairro: string | null
  cidade: string | null
  uf: string | null
}

export function isCompanyComplete(t: CompanyLike): boolean {
  return Boolean(t.cnpj && t.cep && t.logradouro && t.bairro && t.cidade && t.uf)
}
