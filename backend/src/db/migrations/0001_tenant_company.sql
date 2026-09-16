ALTER TABLE "tenants" ADD COLUMN "cnpj" varchar(18);--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "inscricao_municipal" varchar(30);--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "logradouro" text;--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "numero" varchar(20);--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "complemento" text;--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "bairro" text;--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "cep" varchar(9);--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "cidade" text;--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "uf" varchar(2);--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "telefone" varchar(50);--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "email_contato" varchar(255);