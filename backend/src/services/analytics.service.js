/**
 * @fileoverview Click analytics: capturing a click (`recordClick`) and
 * reading back the aggregates for a link (`getLinkAnalytics`). Like every
 * other service, this never imports `express` or sees `req`/`res` — the
 * redirect controller extracts plain values (ip, user-agent string,
 * referrer, country) from the request and hands them in.
 * @author Mohit Sharma
 */

import { UAParser } from "ua-parser-js";
import * as linkRepository from "../repositories/link.repository.js";
import * as clickRepository from "../repositories/click.repository.js";
import { assertOwnerOrAdmin } from "./link.service.js";
import { hashIp } from "../utils/hash.js";
import { AppError } from "../utils/AppError.js";
import { logger } from "../config/logger.js";
import { clicksRecordedTotal } from "../config/metrics.js";

const TOP_REFERRERS_LIMIT = 5;

/**
 * Captures one click against a link: parses the User-Agent into
 * device/browser/os, hashes the IP, and writes it (see
 * `repositories/click.repository.js#recordClick`). Deliberately
 * fire-and-forget from the caller's perspective — this function catches its
 * own errors and never rejects, because a redirect that already sent its
 * response must not be affected by an analytics write failing afterward
 * (see docs/decisions.md's "No message broker for click analytics").
 *
 * @async
 * @param {object} params
 * @param {bigint | string} params.linkId
 * @param {string | undefined} params.ip
 * @param {string | undefined} params.referrer
 * @param {string | undefined} params.userAgent
 * @param {string | undefined} params.country
 * @returns {Promise<void>}
 */
export async function recordClick({ linkId, ip, referrer, userAgent, country }) {
  try {
    const { browser, os, device } = new UAParser(userAgent ?? "").getResult();
    await clickRepository.recordClick({
      linkId,
      ipHash: ip ? hashIp(ip) : null,
      country: country ?? null,
      referrer: referrer ?? null,
      // ua-parser-js only sets device.type for non-desktop UAs (mobile,
      // tablet, console, ...) — an absent type means an ordinary desktop
      // browser, not "unknown."
      deviceType: device.type ?? "desktop",
      browser: browser.name ?? null,
      os: os.name ?? null,
    });
    clicksRecordedTotal.inc({ status: "success" });
  } catch (err) {
    clicksRecordedTotal.inc({ status: "error" });
    logger.error({ err, linkId }, "Click capture failed");
  }
}

/**
 * Aggregate click analytics for one link, scoped by the same
 * owner-or-admin rule as every other single-link operation.
 *
 * @async
 * @param {bigint} linkId
 * @param {{id: string, role: string}} user
 * @param {number} rangeDays - Look back this many days from now.
 * @returns {Promise<object>} The analytics DTO.
 * @throws {AppError} 404 if not found or soft-deleted, 403 if not the owner or an admin.
 */
export async function getLinkAnalytics(linkId, user, rangeDays) {
  const link = await linkRepository.findById(linkId);
  if (!link) throw AppError.notFound("Link not found", "LINK_NOT_FOUND");
  assertOwnerOrAdmin(link, user);

  const [stats, clicksByDay, topReferrers, deviceBreakdown, browserBreakdown, osBreakdown] = await Promise.all([
    clickRepository.getClickStats(linkId, rangeDays),
    clickRepository.getClicksByDay(linkId, rangeDays),
    clickRepository.getTopReferrers(linkId, rangeDays, TOP_REFERRERS_LIMIT),
    clickRepository.getBreakdown(linkId, rangeDays, "device_type"),
    clickRepository.getBreakdown(linkId, rangeDays, "browser"),
    clickRepository.getBreakdown(linkId, rangeDays, "os"),
  ]);

  return {
    linkId: link.id,
    shortCode: link.short_code,
    rangeDays,
    totalClicks: stats.total,
    uniqueVisitors: stats.uniqueVisitors,
    clicksByDay: clicksByDay.map((row) => ({ date: row.day, count: row.count })),
    topReferrers: topReferrers.map((row) => ({ referrer: row.referrer, count: row.count })),
    deviceBreakdown: deviceBreakdown.map((row) => ({ deviceType: row.value ?? "unknown", count: row.count })),
    browserBreakdown: browserBreakdown.map((row) => ({ browser: row.value ?? "unknown", count: row.count })),
    osBreakdown: osBreakdown.map((row) => ({ os: row.value ?? "unknown", count: row.count })),
  };
}
