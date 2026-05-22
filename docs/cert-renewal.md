# Certificate auto-renewal

Certbot's renewal loop runs inside the `certbot` container and checks
every 12 hours. Let's Encrypt certs are renewed automatically when they
are within 30 days of expiry.

To verify renewal is working:

```bash
docker compose exec certbot certbot renew --dry-run
```

## Manual renewal (if needed)

```bash
docker compose run --rm certbot renew
docker compose exec nginx nginx -s reload
```

## Crontab fallback (belt-and-suspenders)

Add to root crontab (`sudo crontab -e`):

```
# Reload Nginx after cert renewal to pick up new certs.
0 3 * * * docker compose -f /opt/armoredpress/docker-compose.yml exec nginx nginx -s reload
```

## Hostinger firewall note

Ensure ports 80 and 443 are open in the Hostinger control panel firewall
as well as UFW — some plans apply an additional firewall layer above the VPS.
