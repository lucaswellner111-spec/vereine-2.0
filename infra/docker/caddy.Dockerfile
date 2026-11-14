# OPTIONAL: Caddy mit Rate-Limit-Modul (caddy-ratelimit). Das Standard-Image caddy:2 hat keins.
# Bauen: docker build -f infra/docker/caddy.Dockerfile -t vereine-caddy:rl infra/docker
# Nutzen: in .env CADDY_IMAGE=vereine-caddy:rl, in der Caddyfile `import ratelimit` aktivieren (infra/deploy/ratelimit.caddy.example).
# Die Version des Moduls vor dem Einsatz am Quell-Repository pruefen und festschreiben (Lieferkette: kein "latest" in Produktion).
FROM caddy:2-builder AS builder
RUN xcaddy build --with github.com/mholt/caddy-ratelimit

FROM caddy:2
COPY --from=builder /usr/bin/caddy /usr/bin/caddy
