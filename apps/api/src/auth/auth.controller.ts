import {
  BadRequestException,
  NotFoundException,
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Delete,
  Param,
  Post,
  Put,
  Req,
  UseGuards,
  Res,
  UnauthorizedException,
} from "@nestjs/common";
import type { FastifyReply, FastifyRequest } from "fastify";
import {
  CHECK_INBOX_MESSAGE,
  changeEmailSchema,
  changePasswordSchema,
  emailTokenSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  type CheckInboxResponse,
  type ConfirmEmailResult,
  loginSchema,
  registerSchema,
  twoFactorCodeSchema,
  twoFactorConfirmSchema,
  twoFactorLoginSchema,
  type LoginResult,
  type PublicUser,
  type SessionInfo,
  type TwoFactorSetup,
  type TwoFactorStatus,
} from "@vereine/shared";
import { parse } from "../common/parse";
import { AuthService, SESSION_TTL_MS } from "./auth.service";
import { EmailFlowsService } from "./email-flows.service";
import { CurrentUser, SESSION_COOKIE, SessionGuard } from "./session.guard";

@Controller("auth")
export class AuthController {
  constructor(
    @Inject(AuthService) private readonly auth: AuthService,
    @Inject(EmailFlowsService) private readonly flows: EmailFlowsService,
  ) {}

  /** Immer dieselbe Antwort (202), auch fuer vorhandene Adressen; angemeldet wird erst ueber den Link in der Mail. */
  @Post("register")
  @HttpCode(202)
  async register(@Body() body: unknown, @Req() req: FastifyRequest): Promise<CheckInboxResponse> {
    await this.flows.register(parse(registerSchema, body), req.ip);
    return { message: CHECK_INBOX_MESSAGE };
  }

  /** Link aus der Bestaetigungs- bzw. Adresswechsel-Mail einloesen. Frische Registrierung: meldet direkt an. */
  @Post("email/confirm")
  @HttpCode(200)
  async confirmEmail(@Body() body: unknown, @Req() req: FastifyRequest, @Res({ passthrough: true }) reply: FastifyReply): Promise<ConfirmEmailResult> {
    const { token } = parse(emailTokenSchema, body);
    const { sessionToken, ...result } = await this.flows.confirm(token, req.cookies[SESSION_COOKIE], req.headers["user-agent"]);
    if (sessionToken) this.setSession(reply, sessionToken);
    return result;
  }

  @Post("email/resend")
  @UseGuards(SessionGuard)
  @HttpCode(204)
  resendVerification(@CurrentUser() user: PublicUser, @Req() req: FastifyRequest): Promise<void> {
    return this.flows.resend(user, req.ip);
  }

  @Post("email/change")
  @UseGuards(SessionGuard)
  @HttpCode(202)
  async changeEmail(@CurrentUser() user: PublicUser, @Body() body: unknown, @Req() req: FastifyRequest): Promise<CheckInboxResponse> {
    const { newEmail, password } = parse(changeEmailSchema, body);
    await this.flows.requestEmailChange(user, newEmail, password, req.ip);
    return { message: CHECK_INBOX_MESSAGE };
  }

  /** Immer 202, egal ob es das Konto gibt. */
  @Post("password/forgot")
  @HttpCode(202)
  async forgotPassword(@Body() body: unknown, @Req() req: FastifyRequest): Promise<CheckInboxResponse> {
    await this.flows.forgotPassword(parse(forgotPasswordSchema, body).email, req.ip);
    return { message: CHECK_INBOX_MESSAGE };
  }

  @Post("password/reset")
  @HttpCode(204)
  resetPassword(@Body() body: unknown): Promise<void> {
    const { token, newPassword } = parse(resetPasswordSchema, body);
    return this.flows.resetPassword(token, newPassword);
  }

  private setSession(reply: FastifyReply, token: string) {
    reply.setCookie(SESSION_COOKIE, token, {
      httpOnly: true,
      secure: (process.env.COOKIE_SECURE ?? String(process.env.NODE_ENV === "production")) === "true",
      sameSite: "lax",
      path: "/",
      maxAge: SESSION_TTL_MS / 1000,
    });
  }

  @Post("login")
  @HttpCode(200)
  async login(
    @Body() body: unknown,
    @Req() req: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<LoginResult> {
    const result = await this.auth.login(parse(loginSchema, body), req.headers["user-agent"], req.ip);
    if ("challenge" in result) return { twoFactorRequired: true, challenge: result.challenge };
    this.setSession(reply, result.token);
    return result.user;
  }

  @Post("login/2fa")
  @HttpCode(200)
  async loginTwoFactor(
    @Body() body: unknown,
    @Req() req: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<PublicUser> {
    const { challenge, code } = parse(twoFactorLoginSchema, body);
    const { user, token } = await this.auth.completeTwoFactorLogin(challenge, code, req.headers["user-agent"]);
    this.setSession(reply, token);
    return user;
  }

  @Get("2fa")
  @UseGuards(SessionGuard)
  twoFactorStatus(@CurrentUser() user: PublicUser): Promise<TwoFactorStatus> {
    return this.auth.twoFactorStatus(user.id);
  }

  @Post("2fa/setup")
  @UseGuards(SessionGuard)
  @HttpCode(200)
  twoFactorSetup(@CurrentUser() user: PublicUser): Promise<TwoFactorSetup> {
    return this.auth.twoFactorSetup(user);
  }

  @Post("2fa/enable")
  @UseGuards(SessionGuard)
  @HttpCode(200)
  async twoFactorEnable(@CurrentUser() user: PublicUser, @Body() body: unknown): Promise<{ recoveryCodes: string[] }> {
    return { recoveryCodes: await this.auth.twoFactorEnable(user.id, parse(twoFactorCodeSchema, body).code) };
  }

  @Post("2fa/disable")
  @UseGuards(SessionGuard)
  @HttpCode(204)
  twoFactorDisable(@CurrentUser() user: PublicUser, @Body() body: unknown): Promise<void> {
    const { password, code } = parse(twoFactorConfirmSchema, body);
    return this.auth.twoFactorDisable(user.id, password, code);
  }

  @Post("2fa/recovery-codes")
  @UseGuards(SessionGuard)
  @HttpCode(200)
  async twoFactorRegenerate(@CurrentUser() user: PublicUser, @Body() body: unknown): Promise<{ recoveryCodes: string[] }> {
    const { password, code } = parse(twoFactorConfirmSchema, body);
    return { recoveryCodes: await this.auth.twoFactorRegenerate(user.id, password, code) };
  }

  @Post("logout")
  @HttpCode(204)
  async logout(
    @Req() req: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<void> {
    const token = req.cookies[SESSION_COOKIE];
    if (token) await this.auth.logout(token);
    reply.clearCookie(SESSION_COOKIE, { path: "/" });
  }

  @Get("sessions")
  @UseGuards(SessionGuard)
  sessions(@CurrentUser() user: PublicUser, @Req() req: FastifyRequest): Promise<SessionInfo[]> {
    return this.auth.listSessions(user.id, req.cookies[SESSION_COOKIE]);
  }

  @Post("sessions/revoke-others")
  @UseGuards(SessionGuard)
  @HttpCode(200)
  async revokeOthers(@CurrentUser() user: PublicUser, @Req() req: FastifyRequest): Promise<{ revoked: number }> {
    return { revoked: await this.auth.revokeOtherSessions(user.id, req.cookies[SESSION_COOKIE]!) };
  }

  @Delete("sessions/:id")
  @UseGuards(SessionGuard)
  @HttpCode(204)
  async revoke(@CurrentUser() user: PublicUser, @Param("id") id: string): Promise<void> {
    if (!/^[0-9a-f]{16}$/.test(id)) throw new BadRequestException("Ungueltige Sitzung.");
    if (!(await this.auth.revokeSession(user.id, id))) throw new NotFoundException("Sitzung nicht gefunden.");
  }

  @Put("password")
  @UseGuards(SessionGuard)
  @HttpCode(204)
  changePassword(@CurrentUser() user: PublicUser, @Req() req: FastifyRequest, @Body() body: unknown): Promise<void> {
    const { currentPassword, newPassword } = parse(changePasswordSchema, body);
    return this.auth.changePassword(user.id, currentPassword, newPassword, req.cookies[SESSION_COOKIE]!);
  }

  @Get("me")
  async me(@Req() req: FastifyRequest): Promise<PublicUser> {
    const token = req.cookies[SESSION_COOKIE];
    const user = token ? await this.auth.userForToken(token) : null;
    if (!user) throw new UnauthorizedException();
    return user;
  }
}
