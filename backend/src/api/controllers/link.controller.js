/**
 * @fileoverview HTTP-facing handlers for the links resource. Translate
 * `req` into plain service calls and shape the response — no SQL, no
 * business rules, no direct Postgres/Redis access.
 *
 * `POST /` runs behind `optionalAuth` (anonymous creation is allowed,
 * ownership is attributed if the caller happens to be logged in);
 * every other route here runs behind `requireAuth`, so `req.user` is
 * guaranteed present in all of them except `createLink`.
 * @author Mohit Sharma
 */

import * as linkService from "../../services/link.service.js";

/**
 * POST /api/v1/links
 * Creates a new short link. Query `?mode=random` requests an unguessable
 * random code instead of the default sequential Base62 code; a `customAlias`
 * in the body takes priority over both.
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @returns {Promise<void>}
 */
export async function createLink(req, res) {
  const { longUrl, customAlias, title, expiresAt } = req.valid.body;
  const { mode } = req.valid.query;

  const link = await linkService.createLink({
    longUrl,
    mode,
    customAlias,
    title,
    expiresAt,
    userId: req.user?.id,
  });

  res.status(201).json({ data: link });
}

/**
 * GET /api/v1/links
 * Paginated, filterable, sortable list, scoped to the caller's own links —
 * except for admins, who see every link (RBAC: role changes the query, not
 * just what actions are allowed).
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @returns {Promise<void>}
 */
export async function listLinks(req, res) {
  const ownerFilter = req.user.role === "admin" ? undefined : req.user.id;
  const result = await linkService.listLinks(req.valid.query, ownerFilter);
  res.status(200).json(result);
}

/**
 * GET /api/v1/links/:id
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @returns {Promise<void>}
 */
export async function getLink(req, res) {
  const link = await linkService.getLinkById(req.valid.params.id, req.user);
  res.status(200).json({ data: link });
}

/**
 * PATCH /api/v1/links/:id
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @returns {Promise<void>}
 */
export async function updateLink(req, res) {
  const link = await linkService.updateLink(req.valid.params.id, req.valid.body, req.user);
  res.status(200).json({ data: link });
}

/**
 * DELETE /api/v1/links/:id — soft delete.
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @returns {Promise<void>}
 */
export async function deleteLink(req, res) {
  await linkService.deleteLink(req.valid.params.id, req.user);
  res.status(204).send();
}
