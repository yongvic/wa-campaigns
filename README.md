# WA Campaigns

Dashboard de campagnes WhatsApp basé sur **GOWA** ([go-whatsapp-web-multidevice](https://github.com/aldinokemal/go-whatsapp-web-multidevice)), sans fork ni modification du code GOWA.

## Architecture

```
Internet → (optionnel) Caddy HTTPS → dashboard (Vite UI + Express)
                                      └─ réseau Docker interne → gowa (image officielle, non exposée)
```

| Conteneur | Rôle |
|-----------|------|
| `gowa` | API WhatsApp officielle. **Aucun port publié.** Basic Auth interne. |
| `dashboard` | UI + API Node (auth login/mdp, file de campagnes SQLite, proxy GOWA dont image QR). |
| `caddy` | Reverse proxy HTTPS (profil Docker `https`, désactivé par défaut). |

Le navigateur n’appelle **jamais** GOWA directement : uniquement `/api/*` sur le dashboard.

## Fonctionnalités v1

- Login / mot de passe (un utilisateur)
- Connexion WhatsApp : QR + statut (proxy)
- Campagnes : CSV, collage ou carnet WhatsApp, vérification `/user/check`, texte / image / vidéo / document
- File d’attente serveur (SQLite) : check `/user/check`, envoi `/send/message` ou `/send/image|video|file`, délai aléatoire, reprise après redémarrage

Hors scope v1 : templates, multi-numéros.

## Prérequis

- Docker + Docker Compose
- Node.js ≥ 22 (dev local uniquement)
- Un VPS pour la prod (pas encore requis pour démarrer en local)

## Démarrage local (dev)

```bash
cp .env.example .env
# Éditer DASHBOARD_* , SESSION_SECRET, GOWA_BASIC_AUTH

# Terminal 1 — GOWA seul (exposé en local pour le dev)
docker run --rm -p 3000:3000 \
  -e APP_BASIC_AUTH=gowa:secret \
  -e APP_UI_ENABLED=false \
  -v gowa_dev:/app/storages \
  aldinokemal2104/go-whatsapp-web-multidevice:v9.0.1 rest

# Terminal 2 — app
npm install
GOWA_BASE_URL=http://127.0.0.1:3000 GOWA_BASIC_AUTH=gowa:secret npm run dev
```

- UI : http://127.0.0.1:5173  
- API : http://127.0.0.1:8080  

## Déploiement Docker (VPS)

### 1. Première installation

```bash
git clone <ce-repo> /opt/wa-campaigns
cd /opt/wa-campaigns
cp .env.example .env
# Remplir DASHBOARD_USER, DASHBOARD_PASSWORD, SESSION_SECRET, GOWA_BASIC_AUTH
# Laisser DOMAIN vide et ENABLE_HTTPS=false pour du HTTP simple

docker compose up -d --build
```

Dashboard : `http://VPS_IP:8080`

GOWA n’est pas accessible depuis Internet.

### 2. Activer HTTPS (quand le domaine pointe vers le VPS)

1. DNS A/AAAA du domaine → IP du VPS  
2. Dans `.env` :

```env
DOMAIN=campaigns.example.com
ACME_EMAIL=you@example.com
ENABLE_HTTPS=true
COOKIE_SECURE=true
```

3. Retirer l’exposition publique du port dashboard (éditer `docker-compose.yml` : commenter `ports` sous `dashboard`, Caddy seul écoute 80/443).

4. Lancer avec le profil Caddy :

```bash
docker compose --profile https up -d
```

Caddy obtient automatiquement un certificat Let’s Encrypt.

### 3. Mettre à jour GOWA (version pinnée)

Ne pas utiliser `latest` en production. Le tag est dans `.env` (`GOWA_IMAGE`).

```bash
# Exemple : passer à une version plus récente après lecture du changelog GOWA
# GOWA_IMAGE=aldinokemal2104/go-whatsapp-web-multidevice:v9.0.x

docker compose pull gowa
docker compose up -d gowa
```

### 4. Déploiement automatique (GitHub Actions)

À chaque push sur `main`, le workflow SSH sur le VPS, tire le code et reconstruit le dashboard.

**Secrets GitHub à configurer** (`Settings → Secrets and variables → Actions`) :

| Secret | Description |
|--------|-------------|
| `VPS_HOST` | IP ou hostname du VPS |
| `VPS_USER` | Utilisateur SSH (ex. `deploy`) |
| `VPS_SSH_KEY` | Clé privée SSH (contenu PEM) |
| `VPS_DEPLOY_PATH` | Chemin absolu du clone (ex. `/opt/wa-campaigns`) |

Sur le VPS : clé publique dans `~/.ssh/authorized_keys`, Docker installé, `.env` déjà présent (jamais committé).

## Variables d’environnement

Voir [`.env.example`](.env.example).

| Variable | Usage |
|----------|--------|
| `DASHBOARD_USER` / `DASHBOARD_PASSWORD` | Auth du dashboard public |
| `SESSION_SECRET` | Signature du cookie de session |
| `GOWA_BASIC_AUTH` | `user:pass` Basic Auth GOWA (interne) |
| `GOWA_BASE_URL` | URL interne (`http://gowa:3000` en compose) |
| `GOWA_DEVICE_ID` | Slot GOWA pour le QR et l’envoi (`main` par défaut, créé si absent) |
| `CAMPAIGN_DELAY_MIN_MS` / `MAX` | Délai aléatoire entre envois (défaut 3–10 s) |
| `MEDIA_MAX_UPLOAD_BYTES` | Taille max d’upload (défaut 100 Mo). Caps : image 16 Mo, vidéo 100 Mo, fichier 50 Mo |
| `DATA_DIR` | SQLite des campagnes + fichiers médias |

## Sécurité

- GOWA : pas de ports publics + Basic Auth
- Dashboard : auth session cookie `httpOnly`
- Secrets uniquement dans `.env` / secrets GitHub

## Structure

```
server/       Express + SQLite + worker + proxy GOWA
dashboard/    Vite React UI
docker-compose.yml
Caddyfile
.github/workflows/deploy.yml
```
