# Security

This integration has administrator access to the router and can change its Xray configuration and client policies. Use it only on a trusted Home Assistant host and a trusted local network.

Never post router passwords, subscription URLs, Xray configuration, Home Assistant `.storage`, backups or logs containing credentials in public issues. Describe the problem with redacted values. GitHub private vulnerability reporting is preferred for security issues.

Subscription and list URLs are stored in Home Assistant private storage; the router password is stored in the Home Assistant config entry. File permissions restrict access, but these values are not encrypted by this integration. Protect Home Assistant backups accordingly.
