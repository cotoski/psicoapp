import { test, expect, type APIRequestContext } from '@playwright/test'

// Fluxo crítico do MVP: login → criar paciente → agendar → registrar → faturar.

const DAY_LABEL = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']

async function registerTenant(request: APIRequestContext, email: string) {
  const res = await request.post('/api/v1/auth/register', {
    data: {
      email,
      password: 'e2e-senha-forte-123',
      nome: 'Dra. E2E',
      tenantName: `E2E ${email}`,
    },
  })
  if (res.status() !== 201) throw new Error(`register falhou: ${res.status()} ${await res.text()}`)
}

test('fluxo completo: login → paciente → agenda → prontuário → faturar', async ({
  page,
  request,
}) => {
  const run = Date.now()
  const email = `e2e-${run}@psicoapp.dev`
  const senha = 'e2e-senha-forte-123'
  const paciente = `E2E Paciente ${run}`

  await registerTenant(request, email)

  // --- Login via UI ---
  await page.goto('/login')
  await page.getByLabel('E-mail').fill(email)
  await page.getByLabel('Senha').fill(senha)
  await page.getByRole('button', { name: 'Entrar' }).click()
  await expect(page).toHaveURL('/')
  await expect(page.getByText('Pacientes ativos')).toBeVisible()

  // --- Criar paciente com agenda recorrente incluindo hoje ---
  await page.goto('/pacientes/novo')
  await page.getByLabel('Nome *').fill(paciente)
  await page.getByLabel('Valor por sessão (R$)').fill('250')
  await page.getByRole('button', { name: DAY_LABEL[new Date().getDay()], exact: true }).click()
  await page.getByLabel('Horário').fill('08:00')
  await page.getByRole('button', { name: 'Criar paciente' }).click()
  await expect(page).toHaveURL(/\/pacientes\/[0-9a-f-]{36}/)
  await expect(page.getByText(paciente)).toBeVisible()

  // --- Agenda: sessão gerada aparece hoje ---
  await page.goto('/agenda')
  await page.getByRole('button', { name: 'Dia' }).click()
  const evento = page.getByRole('button', { name: paciente })
  await expect(evento).toBeVisible()
  await evento.click()

  // --- Abrir atendimento e registrar prontuário ---
  await page.getByRole('button', { name: 'Abrir atendimento' }).click()
  await expect(page).toHaveURL(/\/agenda\/[0-9a-f-]{36}/)
  await page.getByLabel('Registro clínico').fill('Evolução E2E: paciente apresentou melhora.')
  await page.getByPlaceholder('Ex.: ansiedade, trabalho…').fill('teste-e2e')
  await page.getByPlaceholder('Ex.: ansiedade, trabalho…').press('Enter')
  await page.getByLabel('Estado emocional (1–10)').fill('7')
  await page.getByRole('button', { name: 'Salvar prontuário' }).click()
  await expect(page.getByText('Prontuário salvo.')).toBeVisible()

  // --- Financeiro: faturar a sessão ---
  await page.goto('/financeiro')
  const grupo = page.getByTestId('pending-group').filter({ hasText: paciente }).first()
  await expect(grupo).toBeVisible()
  // Marca o checkbox da sessão dentro do grupo do paciente
  await grupo.locator('input[type="checkbox"]').last().check()
  await page.getByRole('button', { name: /Faturar/ }).click()
  await expect(page.getByText(/Nota gerada/)).toBeVisible()
})
