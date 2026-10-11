/**
 * utils/complaintQuery.js
 * One shared place that converts the query string of a complaint list page
 * into a MongoDB query.
 *
 *   GET /admin/complaints?search=wifi&status=Assigned&sort=priority&page=2
 *                     |
 *                     v
 *   buildComplaintQuery(req.query)
 *                     |
 *                     v
 *   { filter: {...}, sort: {...}, page: 2, limit: 8, skip: 8 }
 *
 * Used by the student, staff and admin lists so search / filter / sort /
 * pagination behave identically everywhere.
 */
const mongoose = require('mongoose');

const PAGE_SIZE = 8;

const SORT_OPTIONS = {
  newest: { createdAt: -1 },
  oldest: { createdAt: 1 },
  // priorityRank: 1 = Urgent ... 4 = Low (kept in sync inside the Complaint model)
  priority: { priorityRank: 1, createdAt: -1 },
  updated: { updatedAt: -1 },
};

/** Turns user input into a safe regular expression (".", "*" lose their meaning). */
function escapeRegex(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function buildComplaintQuery(query = {}, options = {}) {
  const filter = { ...(options.baseFilter || {}) };

  const search = (query.search || '').trim();
  if (search) {
    const textMatch = new RegExp(escapeRegex(search), 'i');
    filter.$or = [
      { title: textMatch },
      { location: textMatch },
      { ticketId: search.toUpperCase() }, // exact, e.g. CF-1042
      { description: textMatch },
    ];
  }

  if (query.status) filter.status = query.status;
  if (query.category) filter.category = query.category;
  if (query.priority) filter.priority = query.priority;
  if (query.escalated === 'true') filter.isEscalated = true;

  if (query.location) {
    filter.location = new RegExp(escapeRegex(query.location.trim()), 'i');
  }

  if (query.assignedTo === 'unassigned') {
    filter.assignedTo = null;
  } else if (query.assignedTo) {
    if (mongoose.isValidObjectId(query.assignedTo)) {
      filter.assignedTo = query.assignedTo;
    }
  }

  const sort = SORT_OPTIONS[query.sort] || SORT_OPTIONS.newest;

  const parsedPage = parseInt(query.page, 10);
  const page = Number.isNaN(parsedPage) || parsedPage < 1 ? 1 : parsedPage;
  const skip = (page - 1) * PAGE_SIZE;

  return { filter, sort, page, limit: PAGE_SIZE, skip };
}

/**
 * Builds the small window of page numbers shown in the pagination bar:
 *   1 ... 4 5 [6] 7 8 ... 20
 */
function getPaginationPages(currentPage, totalPages, windowSize = 2) {
  if (totalPages <= 1) return [];

  const pages = new Set([1, totalPages]);
  for (let page = currentPage - windowSize; page <= currentPage + windowSize; page += 1) {
    if (page >= 1 && page <= totalPages) pages.add(page);
  }

  const sorted = [...pages].sort((a, b) => a - b);
  const result = [];
  let previousPage = 0;

  sorted.forEach((page) => {
    if (page - previousPage === 2) {
      result.push(previousPage + 1); // fill the single missing number
    } else if (page - previousPage > 2) {
      result.push('...'); // real gap -> show ellipsis
    }
    result.push(page);
    previousPage = page;
  });

  return result;
}

module.exports = { buildComplaintQuery, getPaginationPages, PAGE_SIZE, escapeRegex };
