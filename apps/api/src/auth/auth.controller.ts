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
import { changePasswordSchema, loginSchema, registerSchema, type PublicUser, type SessionInfo } from "@vereine/shared";
import { parse } from "../common/parse";
import { AuthService, SESSION_TTL_MS } from "./auth.service";
import { CurrentUser, SESSION_COOKIE, SessionGuard } from "./session.guard";

@Controller("auth")
export class AuthController {
  constructor(@Inject(AuthService) private readonly auth: AuthService) {}

  @Post("register")
  register(@Body() body: unknown): Promise<PublicUser> {
    return this.auth.register(parse(registerSchema, body));
  }

  @Post("login")
  @HttpCode(200)
  async login(
    @Body() body: unknown,
    @Req() req: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<PublicUser> {
    const { user, token } = await this.auth.login(parse(loginSchema, body), req.headers["user-agent"]);
    reply.setCookie(SESSION_COOKIE, token, {
      httpOnly: true,
      secure: (process.env.COOKIE_SECURE ?? String(process.env.NODE_ENV === "production")) === "true",
      sameSite: "lax",
      path: "/",
      maxAge: SESSION_TTL_MS / 1000,
    });
    return user;
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
