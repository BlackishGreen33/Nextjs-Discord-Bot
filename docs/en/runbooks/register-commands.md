# Production Register-Commands Runbook

> Languages: [English](./register-commands.md) · [繁體中文](../../zhtw/runbooks/register-commands.md) · [简体中文](../../zhcn/runbooks/register-commands.md)

## Purpose

This document explains how to re-register slash commands in production.

## When to Run It

1. after adding, removing, or renaming a slash command
2. after changing command descriptions, options, or localizations
3. when the Discord client shows commands that no longer match the deployed code

## Preconditions

- you have `REGISTER_COMMANDS_KEY`
- you know the production Next.js app URL
- the production `/api/discord-bot/register-commands` endpoint is reachable

## Request Shape

```http
POST /api/discord-bot/register-commands
Authorization: Bearer <REGISTER_COMMANDS_KEY>
```

## Steps

### 1. Send the request to production

Example:

```bash
curl -X POST \
  "https://<your-vercel-app>.vercel.app/api/discord-bot/register-commands" \
  -H "Authorization: Bearer <REGISTER_COMMANDS_KEY>"
```

### 2. Confirm the response

A healthy response should be:

- HTTP `200`
- JSON `{"error":null}` or an equivalent success body

### 3. Handle rate limits if needed

If the endpoint returns:

- HTTP `429`

then wait for the `Retry-After` header and retry later.

## Notes

- the endpoint is rate-limited to `5` requests per IP per minute
- in development, registration can be triggered from the home page button instead of the production flow
- if Discord does not refresh immediately after a successful registration, wait a few minutes and reopen the slash command menu
