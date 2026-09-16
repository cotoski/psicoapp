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

export function NotaDocCard({ nota }: { nota: NotaDoc }) {
  return (
    <div className="nota-doc">
      <div className="nota-header">
        <strong>NOTA DE SERVIÇOS — PRÉVIA</strong>
        <span>
          Competência {nota.competencia} · Emitida em {fmtDateTime(nota.emitidaEm)}
        </span>
      </div>

      <div className="nota-grid">
        <div className="nota-box">
          <h4>Prestador</h4>
          <p>{nota.prestador.nome}</p>
          {nota.prestador.cnpj && <p>CNPJ/CPF {nota.prestador.cnpj}</p>}
          {nota.prestador.inscricaoMunicipal && (
            <p>Insc. Municipal {nota.prestador.inscricaoMunicipal}</p>
          )}
          {nota.prestador.endereco && <p>{nota.prestador.endereco}</p>}
          {nota.prestador.responsavel && (
            <p>
              {nota.prestador.responsavel}
              {nota.prestador.crp ? ` · CRP ${nota.prestador.crp}` : ''}
            </p>
          )}
          {(nota.prestador.email || nota.prestador.telefone) && (
            <p>
              {[nota.prestador.email, nota.prestador.telefone]
                .filter(Boolean)
                .join(' · ')}
            </p>
          )}
        </div>
        <div className="nota-box">
          <h4>Tomador</h4>
          <p>{nota.tomador.nome}</p>
          <p>
            {nota.tomador.cpf ? `CPF ${nota.tomador.cpf}` : 'CPF não informado'}
            {nota.tomador.email ? ` · ${nota.tomador.email}` : ''}
          </p>
        </div>
      </div>

      <div className="nota-box">
        <h4>Discriminação do serviço</h4>
        <p className="nota-discriminacao">{nota.discriminacao}</p>
      </div>

      <table className="nota-table">
        <thead>
          <tr>
            <th>Item</th>
            <th>Data</th>
            <th>Qtde.</th>
            <th>Vl. unitário</th>
            <th>Total</th>
          </tr>
        </thead>
        <tbody>
          {nota.itens.map((it, j) => (
            <tr key={j}>
              <td>{it.descricao}</td>
              <td>{it.data}</td>
              <td>{it.quantidade}</td>
              <td>{fmtMoney(it.valorUnitario)}</td>
              <td>{fmtMoney(it.valorTotal)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {nota.tributos ? (
        <table className="nota-table">
          <thead>
            <tr>
              <th>
                Tributo ({REGIME_LABEL[nota.tributos.regime ?? ''] ?? nota.tributos.regime})
              </th>
              <th>Alíquota</th>
              <th>Valor</th>
            </tr>
          </thead>
          <tbody>
            {nota.tributos.linhas.map((l) => (
              <tr key={l.label}>
                <td>{l.label}</td>
                <td>
                  {l.label === 'ISS'
                    ? `${(nota.tributos!.issAliquota * 100).toFixed(2)}%`
                    : '—'}
                </td>
                <td>{fmtMoney(l.valor)}</td>
              </tr>
            ))}
            <tr>
              <td>
                <strong>Total de tributos (estimado)</strong>
              </td>
              <td />
              <td>
                <strong>{fmtMoney(nota.tributos.total)}</strong>
              </td>
            </tr>
          </tbody>
        </table>
      ) : (
        <p className="section-subtitle">
          Configure regime tributário e município em Tributos para ver a
          estimativa de impostos na nota.
        </p>
      )}

      <div className="nota-totais">
        <span>
          Valor bruto: <strong>{fmtMoney(nota.valorBruto)}</strong>
        </span>
        <span>
          Valor líquido (após tributos est.):{' '}
          <strong>{fmtMoney(nota.valorLiquido)}</strong>
        </span>
      </div>
    </div>
  )
}
