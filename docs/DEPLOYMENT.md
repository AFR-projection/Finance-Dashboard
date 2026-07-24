# Deploy — ringkasan cepat

Panduan lengkap (firewall, domain, Nginx, SSL, troubleshooting):  
→ **[SELF_HOST.md](../SELF_HOST.md)**

```bash
git clone https://github.com/AFR-projection/Finance-Dashboard.git ledgerly
cd ledgerly
cp .env.example .env
chmod +x deploy.sh redeploy.sh scripts/*.sh
./deploy.sh
```

Dengan domain:

```bash
APP_DOMAIN=finance.example.com ./deploy.sh
```

Paksa port:

```bash
APP_PORT=7341 ./deploy.sh
```

Upgrade:

```bash
./redeploy.sh
```

Setelah live: buka URL → `/setup` → `/access` → `/approve KODE` di bot.
