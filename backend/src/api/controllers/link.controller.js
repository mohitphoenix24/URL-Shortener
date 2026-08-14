/**
 * @fileoverview HTTP-facing handlers for the links resource. Translate
 * `req` into plain service calls and shape the response — no SQL, no
 * business rules, no direct Postgres/Redis access. `req.user` (the
 * authenticated caller) doesn't exist yet — it's `undefined` until Phase 2
 * wires up auth middleware, which is why every link created right now is
 * anonymous (`userId` omitted).
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
 * Paginated, filterable, sortable list. Currently unscoped by owner — Phase
 * 2 will restrict this to `req.user.id`'s own links once auth exists.
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @returns {Promise<void>}
 */
export async function listLinks(req, res) {
  const result = await linkService.listLinks(req.valid.query, req.user?.id);
  res.status(200).json(result);
}

/**
 * GET /api/v1/links/:id
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @returns {Promise<void>}
 */
export async function getLink(req, res) {
  const link = await linkService.getLinkById(req.valid.params.id);
  res.status(200).json({ data: link });
}

/**
 * PATCH /api/v1/links/:id
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @returns {Promise<void>}
 */
export async function updateLink(req, res) {
  const link = await linkService.updateLink(req.valid.params.id, req.valid.body);
  res.status(200).json({ data: link });
}

/**
 * DELETE /api/v1/links/:id — soft delete.
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @returns {Promise<void>}
 */
export async function deleteLink(req, res) {
  await linkService.deleteLink(req.valid.params.id);
  res.status(204).send();
}
