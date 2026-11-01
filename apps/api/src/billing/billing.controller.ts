import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Res,
  UseGuards,
} from "@nestjs/common";
import type { FastifyReply } from "fastify";
import {
  createInvoiceSchema,
  voidInvoiceSchema,
  type InvoiceDetail,
  type InvoiceRecipient,
  type InvoiceSummary,
  type PublicUser,
} from "@vereine/shared";
import { CurrentUser, SessionGuard } from "../auth/session.guard";
import { parse } from "../common/parse";
import { BillingService } from "./billing.service";

@Controller()
@UseGuards(SessionGuard)
export class BillingController {
  constructor(@Inject(BillingService) private readonly billing: BillingService) {}

  @Get("billing/mine")
  mine(@CurrentUser() user: PublicUser): Promise<InvoiceSummary[]> {
    return this.billing.mine(user);
  }

  @Get("orgs/:slug/invoices")
  list(
    @CurrentUser() user: PublicUser,
    @Param("slug") slug: string,
    @Query("status") status?: string,
    @Query("year") year?: string,
  ): Promise<InvoiceSummary[]> {
    return this.billing.list(user, slug, { status, year });
  }

  @Get("orgs/:slug/invoice-recipients")
  recipients(@CurrentUser() user: PublicUser, @Param("slug") slug: string): Promise<InvoiceRecipient[]> {
    return this.billing.recipients(user, slug);
  }

  @Get("orgs/:slug/invoices.csv")
  @Header("Content-Type", "text/csv; charset=utf-8")
  @Header("Content-Disposition", 'attachment; filename="rechnungen.csv"')
  @Header("X-Content-Type-Options", "nosniff")
  csv(@CurrentUser() user: PublicUser, @Param("slug") slug: string, @Query("year") year?: string): Promise<string> {
    return this.billing.csv(user, slug, year);
  }

  @Post("orgs/:slug/invoices")
  create(@CurrentUser() user: PublicUser, @Param("slug") slug: string, @Body() body: unknown): Promise<InvoiceDetail> {
    return this.billing.create(user, slug, parse(createInvoiceSchema, body));
  }

  @Get("invoices/:id")
  one(@CurrentUser() user: PublicUser, @Param("id", ParseUUIDPipe) id: string): Promise<InvoiceDetail> {
    return this.billing.get(user, id);
  }

  @Get("invoices/:id/pdf")
  @Header("Content-Type", "application/pdf")
  @Header("Cache-Control", "private, no-store")
  @Header("X-Content-Type-Options", "nosniff")
  async pdf(
    @CurrentUser() user: PublicUser,
    @Param("id", ParseUUIDPipe) id: string,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<Buffer> {
    const { bytes, filename } = await this.billing.pdf(user, id);
    reply.header("Content-Disposition", `attachment; filename="${filename}"`);
    return Buffer.from(bytes);
  }

  @Post("invoices/:id/finalize")
  finalize(@CurrentUser() user: PublicUser, @Param("id", ParseUUIDPipe) id: string): Promise<InvoiceDetail> {
    return this.billing.finalize(user, id);
  }

  @Post("invoices/:id/paid")
  paid(@CurrentUser() user: PublicUser, @Param("id", ParseUUIDPipe) id: string): Promise<InvoiceDetail> {
    return this.billing.markPaid(user, id);
  }

  @Post("invoices/:id/void")
  void(@CurrentUser() user: PublicUser, @Param("id", ParseUUIDPipe) id: string, @Body() body: unknown): Promise<InvoiceDetail> {
    return this.billing.voidInvoice(user, id, parse(voidInvoiceSchema, body).reason);
  }

  @Delete("invoices/:id")
  @HttpCode(204)
  remove(@CurrentUser() user: PublicUser, @Param("id", ParseUUIDPipe) id: string): Promise<void> {
    return this.billing.deleteDraft(user, id);
  }
}
