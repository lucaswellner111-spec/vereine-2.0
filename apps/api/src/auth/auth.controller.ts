import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Post,
  Req,
  Res,
  UnauthorizedException,
} from "@nestjs/common";
import type { FastifyReply, FastifyRequest } from "fastify";
import type { ZodType } from "zod";
import { loginSchema, registerSchema, type PublicUser } from "@vereine/shared";
import { AuthService, SESSION_TTL_MS } from "./auth.service";
import { SESSION_COOKIE } from "./session.guard";

function parse<T>(schema: ZodType<T>, body: unknown): T {
  const result = schema.safeParse(body);
  if (!result.success) {
    throw new BadRequestException(result.error.flatten().fieldErrors);
  }
  return result.data;
}

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
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<PublicUser> {
    const { user, token } = await this.auth.login(parse(loginSchema, body));
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

  @Get("me")
  async me(@Req() req: FastifyRequest): Promise<PublicUser> {
    const token = req.cookies[SESSION_COOKIE];
    const user = token ? await this.auth.userForToken(token) : null;
    if (!user) throw new UnauthorizedException();
    return user;
  }
}
