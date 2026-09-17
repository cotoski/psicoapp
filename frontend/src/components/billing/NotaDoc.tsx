import type { ReactNode } from 'react'
import { fmtDateTime, fmtMoney } from '../../utils/format'

export interface NotaDoc {
  prestador: {
    nome: string
    responsavel: string | null
    crp: string | null
    cnpj?: string | null
    inscricaoMunicipal?: string | null
    endereco?: string | null
    email?: string | null
    telefone?: string | null
  }
  tomador: {
    nome: string
    cpf: string | null
    email: string | null
    telefone: string | null
  }
  competencia: string
  emitidaEm: string
  itens: {
    descricao: string
    data: string
    quantidade: number
    valorUnitario: number
    valorTotal: number
  }[]
  discriminacao: string
  valorBruto: number
  tributos: {
    regime: string | null
    municipio: string | null
    issAliquota: number
    linhas: { label: string; valor: number }[]
    total: number
  } | null
  valorLiquido: number
}

const REGIME_LABEL: Record<string, string> = {
  pf: 'Pessoa Física',
  simples: 'Simples Nacional',
  presumido: 'Lucro Presumido',
}

function NotaBox({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-lg border p-3">
      <h4 className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {title}
      </h4>
      {children}
    </div>
  )
}

const thClass = 'border bg-accent px-2 py-1.5 text-left text-[11px] font-medium uppercase tracking-wide text-accent-foreground'
const tdClass = 'border px-2 py-1.5 text-sm'

export function NotaDocCard({ nota }: { nota: NotaDoc }) {
  return (
    <div className="rounded-xl border bg-card p-4 print:break-inside-avoid">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2 border-b pb-2 text-sm">
        <strong className="tracking-wide">NOTA DE SERVIÇOS — PRÉVIA</strong>
        <span className="text-xs text-muted-foreground">
          Competência {nota.competencia} · Emitida em {fmtDateTime(nota.emitidaEm)}
        </span>
      </div>

      <div className="mb-3 grid gap-3 sm:grid-cols-2">
        <NotaBox title="Prestador">
          <p className="text-sm">{nota.prestador.nome}</p>
          {nota.prestador.cnpj && <p className="text-sm">CNPJ/CPF {nota.prestador.cnpj}</p>}
          {nota.prestador.inscricaoMunicipal && (
            <p className="text-sm">Insc. Municipal {nota.prestador.inscricaoMunicipal}</p>
          )}
          {nota.prestador.endereco && <p className="text-sm">{nota.prestador.endereco}</p>}
          {nota.prestador.responsavel && (
            <p className="text-sm">
              {nota.prestador.responsavel}
              {nota.prestador.crp ? ` · CRP ${nota.prestador.crp}` : ''}
            </p>
          )}
          {(nota.prestador.email || nota.prestador.telefone) && (
            <p className="text-sm">
              {[nota.prestador.email, nota.prestador.telefone].filter(Boolean).join(' · ')}
            </p>
          )}
        </NotaBox>
        <NotaBox title="Tomador">
          <p className="text-sm">{nota.tomador.nome}</p>
          <p className="text-sm">
            {nota.tomador.cpf ? `CPF ${nota.tomador.cpf}` : 'CPF não informado'}
            {nota.tomador.email ? ` · ${nota.tomador.email}` : ''}
          </p>
        </NotaBox>
      </div>

      <NotaBox title="Discriminação do serviço">
        <p className="text-sm leading-relaxed">{nota.discriminacao}</p>
      </NotaBox>

      <table className="mt-3 w-full border-collapse text-sm">
        <thead>
          <tr>
            <th className={thClass}>Item</th>
            <th className={thClass}>Data</th>
            <th className={thClass}>Qtde.</th>
            <th className={thClass}>Vl. unitário</th>
            <th className={thClass}>Total</th>
          </tr>
        </thead>
        <tbody>
          {nota.itens.map((it, j) => (
            <tr key={j}>
              <td className={tdClass}>{it.descricao}</td>
              <td className={tdClass}>{it.data}</td>
              <td className={tdClass}>{it.quantidade}</td>
              <td className={tdClass}>{fmtMoney(it.valorUnitario)}</td>
              <td className={tdClass}>{fmtMoney(it.valorTotal)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {nota.tributos ? (
        <table className="mt-3 w-full border-collapse text-sm">
          <thead>
            <tr>
              <th className={thClass}>
                Tributo ({REGIME_LABEL[nota.tributos.regime ?? ''] ?? nota.tributos.regime})
              </th>
              <th className={thClass}>Alíquota</th>
              <th className={thClass}>Valor</th>
            </tr>
          </thead>
          <tbody>
            {nota.tributos.linhas.map((l) => (
              <tr key={l.label}>
                <td className={tdClass}>{l.label}</td>
                <td className={tdClass}>
                  {l.label === 'ISS'
                    ? `${(nota.tributos!.issAliquota * 100).toFixed(2)}%`
                    : '—'}
                </td>
                <td className={tdClass}>{fmtMoney(l.valor)}</td>
              </tr>
            ))}
            <tr>
              <td className={tdClass}>
                <strong>Total de tributos (estimado)</strong>
              </td>
              <td className={tdClass} />
              <td className={tdClass}>
                <strong>{fmtMoney(nota.tributos.total)}</strong>
              </td>
            </tr>
          </tbody>
        </table>
      ) : (
        <p className="mt-3 text-sm text-muted-foreground">
          Configure regime tributário e município em Tributos para ver a
          estimativa de impostos na nota.
        </p>
      )}

      <div className="mt-3 flex flex-wrap justify-between gap-2 border-t pt-2 text-sm">
        <span>
          Valor bruto: <strong>{fmtMoney(nota.valorBruto)}</strong>
        </span>
        <span>
          Valor líquido (após tributos est.): <strong>{fmtMoney(nota.valorLiquido)}</strong>
        </span>
      </div>
    </div>
  )
}
