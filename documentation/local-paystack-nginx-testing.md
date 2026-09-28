# Local Paystack testing through Docker Nginx

This setup keeps Next.js on the host at port 3000 and puts a production-like
Nginx edge in Docker at port 8080. MySQL remains unchanged.

## Start

```powershell
docker compose up -d mysql
npm run prepare:local-proxy
npm run start:local-proxy
docker compose --profile proxy up -d nginx
```

The local `.env.local` must contain an absolute `UPLOAD_DIR`; production-mode
validation intentionally refuses to start without one. Open `http://localhost:8080`.
Do not use port 3000 for the payment walkthrough,
because callback-origin validation is configured for the proxy origin.

## Verify the edge

```powershell
curl.exe -i http://localhost:8080/api/health
docker compose --profile proxy logs nginx
```

## Paystack webhook delivery

Nginx does not make a laptop public. For a real Paystack test webhook, create an
HTTPS tunnel whose upstream is `http://localhost:8080`. Set `NEXTAUTH_URL` to that
public HTTPS origin, restart Next.js, and open SchoolPro through the same origin.
Then copy the school-specific webhook URL from the payment settings screen into
the Paystack test dashboard.

The tunnel must preserve the request body and `x-paystack-signature`. Nginx then
forwards the original request bytes to the application for HMAC verification.

## Stop

```powershell
docker compose --profile proxy stop nginx
```

Do not run `docker compose down -v`; `-v` deletes the local MySQL volume.
