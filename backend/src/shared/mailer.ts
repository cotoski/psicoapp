import nodemailer, { type Transporter } from 'nodemailer'
import type { Config } from '../config.js'
import type { Logger } from './logger.js'

export interface Mail {
  to: string
  subject: string
  text: string
  html?: string
}

// SMTP local por padrão (Mailpit no dev — docker-compose expõe :1025).
// Falhas de envio são logadas e retornam false — nunca vazam para o cliente.
export class Mailer {
  private transporter: Transporter

  constructor(
    private config: Config,
    private logger: Logger,
  ) {
    this.transporter = nodemailer.createTransport({
      host: config.SMTP_HOST,
      port: config.SMTP_PORT,
      secure: config.SMTP_PORT === 465,
    })
  }

  async send(mail: Mail): Promise<boolean> {
    try {
      await this.transporter.sendMail({ from: this.config.SMTP_FROM, ...mail })
      return true
    } catch (err) {
      this.logger.warn({ err, to: mail.to }, 'falha ao enviar e-mail')
      return false
    }
  }
}
