/**
 * UI Renderer Module
 * Handles DOM construction, skeleton states, detail drawer animations, 
 * filter lists rendering, and clean UI updates.
 */

import { state, getFilteredIssues, getFilterOptions, matchesActiveFilters } from './state.js';

// DOM Element cache
const elements = {
  board: () => document.getElementById('kanban-board'),
  repoTitle: () => document.getElementById('repo-title'),
  repoDesc: () => document.getElementById('repo-desc'),
  starsCount: () => document.getElementById('stars-count'),
  forksCount: () => document.getElementById('forks-count'),
  openIssuesCount: () => document.getElementById('open-issues-count'),
  metaContainer: () => document.getElementById('repo-meta-container'),
  
  // Columns
  colOpen: () => document.querySelector('.kanban-column[data-column="open"] .issue-list'),
  colReview: () => document.querySelector('.kanban-column[data-column="review"] .issue-list'),
  colClosed: () => document.querySelector('.kanban-column[data-column="closed"] .issue-list'),
  
  // Filters
  filterLabel: () => document.getElementById('filter-label'),
  filterAssignee: () => document.getElementById('filter-assignee'),
  filterKeyword: () => document.getElementById('filter-keyword'),
  
  // Detail Panel
  detailBackdrop: () => document.getElementById('detail-backdrop'),
  detailPanel: () => document.getElementById('detail-panel'),
  detailCloseBtn: () => document.getElementById('detail-close'),
  detailTitle: () => document.getElementById('detail-title'),
  detailState: () => document.getElementById('detail-state'),
  detailMeta: () => document.getElementById('detail-meta'),
  detailLabels: () => document.getElementById('detail-labels'),
  detailAssignee: () => document.getElementById('detail-assignee'),
  detailBody: () => document.getElementById('detail-body'),
  
  // Load More
  loadMoreBtn: () => document.getElementById('load-more-btn'),
  loadMoreContainer: () => document.getElementById('load-more-container')
};

/**
 * XSS Mitigation utility to sanitize variables in template strings
 */
function escapeHTML(str) {
  if (!str) return '';
  return str.replace(/[&<>'"]/g, 
    tag => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      "'": '&#39;',
      '"': '&quot;'
    }[tag] || tag)
  );
}

/**
 * Determine contrast text color (black/white) based on label hex background
 */
function getContrastColor(hexcolor) {
  if (!hexcolor) return '#ffffff';
  if (hexcolor.startsWith('#')) {
    hexcolor = hexcolor.slice(1);
  }
  if (hexcolor.length === 3) {
    hexcolor = hexcolor.split('').map(c => c + c).join('');
  }
  const r = parseInt(hexcolor.substr(0, 2), 16);
  const g = parseInt(hexcolor.substr(2, 2), 16);
  const b = parseInt(hexcolor.substr(4, 2), 16);
  const yiq = ((r * 299) + (g * 587) + (b * 114)) / 1000;
  return (yiq >= 128) ? '#080b10' : '#ffffff';
}

/**
 * Render repository metadata in the top card
 */
export function renderRepoMetadata(meta) {
  const container = elements.metaContainer();
  if (!container) return;
  
  container.style.display = 'flex';
  
  const titleLink = elements.repoTitle();
  titleLink.textContent = meta.name;
  titleLink.href = meta.htmlUrl;
  
  elements.repoDesc().textContent = meta.description;
  elements.starsCount().textContent = Number(meta.stars).toLocaleString();
  elements.forksCount().textContent = Number(meta.forks).toLocaleString();
  elements.openIssuesCount().textContent = Number(meta.openIssuesCount).toLocaleString();
}

/**
 * Renders beautiful skeleton loaders to columns without layout shift
 */
export function renderSkeletonLoaders() {
  const colOpen = elements.colOpen();
  const colReview = elements.colReview();
  const colClosed = elements.colClosed();
  
  if (!colOpen || !colReview || !colClosed) return;
  
  // Remove error/empty states first
  elements.board().querySelectorAll('.state-message').forEach(el => el.remove());
  elements.board().style.display = 'grid';

  const createSkeleton = () => {
    const card = document.createElement('div');
    card.className = 'skeleton-card';
    card.innerHTML = `
      <div class="skeleton-text skeleton-title-1"></div>
      <div class="skeleton-text skeleton-title-2"></div>
      <div class="skeleton-text skeleton-title-3"></div>
      <div class="skeleton-text skeleton-label"></div>
      <div style="display:flex; justify-content:space-between; align-items:center; margin-top:0.5rem; padding-top:0.5rem; border-top: 1px solid rgba(240,246,252,0.05)">
        <div class="skeleton-text skeleton-footer-1"></div>
        <div class="skeleton-text skeleton-footer-2"></div>
      </div>
    `;
    return card;
  };

  // Append 3 skeleton cards to Open, 1 to Review, 2 to Closed for natural variation
  colOpen.innerHTML = '';
  colReview.innerHTML = '';
  colClosed.innerHTML = '';
  
  for (let i = 0; i < 3; i++) colOpen.appendChild(createSkeleton());
  for (let i = 0; i < 1; i++) colReview.appendChild(createSkeleton());
  for (let i = 0; i < 2; i++) colClosed.appendChild(createSkeleton());
  
  updateColumnBadges();
}

/**
 * Clear cards from all columns
 */
export function clearColumns() {
  const lists = [elements.colOpen(), elements.colReview(), elements.colClosed()];
  lists.forEach(list => {
    if (list) list.innerHTML = '';
  });
}

/**
 * Helper to construct an individual issue card element
 */
export function createIssueCardElement(issue) {
  const card = document.createElement('div');
  card.className = 'issue-card animate-fade-in';
  card.setAttribute('draggable', 'true');
  card.dataset.id = issue.id;
  card.dataset.number = issue.number;

  // Header & Number
  const number = issue.number;
  const title = escapeHTML(issue.title);
  
  // Comments Badge
  const commentsHtml = issue.comments > 0 
    ? `<div class="meta-icon-item" title="${issue.comments} comments">
         <svg stroke="currentColor" fill="none" stroke-width="2" viewBox="0 0 24 24" width="12" height="12">
           <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
         </svg>
         <span>${issue.comments}</span>
       </div>`
    : '';

  // Labels HTML
  const labelsHtml = (issue.labels || []).map(l => {
    const bgColor = l.color ? `#${l.color}` : 'var(--bg-tertiary)';
    const textColor = getContrastColor(l.color);
    return `<span class="badge-label" style="background-color: ${bgColor}; color: ${textColor}">${escapeHTML(l.name)}</span>`;
  }).join('');

  // Assignee Avatar & Login
  let assigneeHtml = '<span style="color: var(--text-muted); font-size: 0.75rem;">Unassigned</span>';
  if (issue.assignee) {
    assigneeHtml = `
      <img src="${issue.assignee.avatar_url}" class="avatar" alt="${escapeHTML(issue.assignee.login)}" />
      <span style="font-size: 0.75rem; color: var(--text-secondary);">${escapeHTML(issue.assignee.login)}</span>
    `;
  }

  card.innerHTML = `
    <div class="issue-card-header">
      <span class="issue-number">#${number}</span>
      <div class="issue-meta-icons">${commentsHtml}</div>
    </div>
    <h3 class="issue-card-title">${title}</h3>
    <div class="issue-card-labels">${labelsHtml}</div>
    <div class="issue-card-footer">
      <div class="issue-assignee">${assigneeHtml}</div>
    </div>
  `;

  return card;
}

/**
 * Update Kanban column card count badges
 */
export function updateColumnBadges() {
  ['open', 'review', 'closed'].forEach(col => {
    const list = document.querySelector(`.kanban-column[data-column="${col}"] .issue-list`);
    const badge = document.querySelector(`.kanban-column[data-column="${col}"] .column-badge`);
    if (list && badge) {
      // Badge represents the count of currently visible items in the column
      badge.textContent = list.children.length;
    }
  });
}

/**
 * Render complete Board state from the filtered issues list
 */
export function renderBoard() {
  clearColumns();
  
  // Remove existing overlays
  elements.board().querySelectorAll('.state-message').forEach(el => el.remove());
  
  const filtered = getFilteredIssues();
  
  if (state.issues.length === 0) {
    showEmptyState('Enter a public GitHub repository (e.g. facebook/react) above to load its Kanban board.');
    return;
  }

  elements.board().style.display = 'grid';

  // Use document fragments to minimize repaints
  const frags = {
    open: document.createDocumentFragment(),
    review: document.createDocumentFragment(),
    closed: document.createDocumentFragment()
  };

  filtered.forEach(issue => {
    const colId = issue.columnId || 'open';
    if (frags[colId]) {
      const card = createIssueCardElement(issue);
      frags[colId].appendChild(card);
    }
  });

  // Bulk DOM updates
  elements.colOpen().appendChild(frags.open);
  elements.colReview().appendChild(frags.review);
  elements.colClosed().appendChild(frags.closed);

  updateColumnBadges();
  updateLoadMoreButton();
}

/**
 * Append new issues dynamically (Pagination) without wiping the board (Requirement 10)
 */
export function appendIssuesToBoard(newIssues) {
  // Filter new issues to bypass the ones already present in DOM
  const existingCardIds = new Set(
    Array.from(document.querySelectorAll('.issue-card')).map(card => Number(card.dataset.id))
  );

  const frags = {
    open: document.createDocumentFragment(),
    review: document.createDocumentFragment(),
    closed: document.createDocumentFragment()
  };

  let appendedCount = 0;
  
  newIssues.forEach(issue => {
    // Only append if it's not already in DOM AND matches currently active filters
    if (!existingCardIds.has(issue.id) && matchesActiveFilters(issue)) {
      const colId = issue.columnId || 'open';
      if (frags[colId]) {
        const card = createIssueCardElement(issue);
        frags[colId].appendChild(card);
        appendedCount++;
      }
    }
  });

  // Direct append, bypassing reflow of existing issues!
  if (appendedCount > 0) {
    elements.colOpen().appendChild(frags.open);
    elements.colReview().appendChild(frags.review);
    elements.colClosed().appendChild(frags.closed);
    
    updateColumnBadges();
  }

  // Refresh filter menus with new values if any
  populateFilterDropdowns();
  updateLoadMoreButton();
}

/**
 * Populates Filter dropdowns dynamically based on currently loaded state.issues
 */
export function populateFilterDropdowns() {
  const labelSelect = elements.filterLabel();
  const assigneeSelect = elements.filterAssignee();
  if (!labelSelect || !assigneeSelect) return;

  const currentLabelVal = state.filters.label;
  const currentAssigneeVal = state.filters.assignee;

  const options = getFilterOptions();

  // Populate Labels dropdown
  labelSelect.innerHTML = '<option value="">All Labels</option>';
  options.labels.forEach(lbl => {
    const opt = document.createElement('option');
    opt.value = lbl;
    opt.textContent = lbl;
    opt.selected = lbl === currentLabelVal;
    labelSelect.appendChild(opt);
  });

  // Populate Assignees dropdown
  assigneeSelect.innerHTML = '<option value="">All Assignees</option>';
  options.assignees.forEach(assignee => {
    const opt = document.createElement('option');
    opt.value = assignee.login;
    opt.textContent = assignee.login;
    opt.selected = assignee.login === currentAssigneeVal;
    assigneeSelect.appendChild(opt);
  });
}

/**
 * Handle Load More Pagination button display
 */
export function updateLoadMoreButton() {
  const container = elements.loadMoreContainer();
  const btn = elements.loadMoreBtn();
  if (!container || !btn) return;

  if (state.issues.length > 0 && state.hasMore) {
    container.style.display = 'flex';
    btn.disabled = state.isLoading;
    btn.innerHTML = state.isLoading 
      ? `<svg class="spinner" stroke="currentColor" fill="none" stroke-width="3" viewBox="0 0 24 24" width="16" height="16" style="animation: shimmer 1.2s infinite linear; margin-right: 0.5rem">
           <circle cx="12" cy="12" r="10" stroke-opacity="0.25"></circle>
           <path d="M12 2a10 10 0 0 1 10 10" stroke-linecap="round"></path>
         </svg> Loading...`
      : 'Load More Issues';
  } else {
    container.style.display = 'none';
  }
}

/**
 * Renders an Error overlay in the board container
 */
export function showErrorState(message) {
  clearColumns();
  elements.board().style.display = 'block';
  
  elements.board().querySelectorAll('.state-message').forEach(el => el.remove());
  
  const errDiv = document.createElement('div');
  errDiv.className = 'state-message animate-fade-in';
  errDiv.innerHTML = `
    <div class="state-message-icon error">
      <svg stroke="currentColor" fill="none" stroke-width="2" viewBox="0 0 24 24" width="40" height="40">
        <circle cx="12" cy="12" r="10"></circle>
        <line x1="12" y1="8" x2="12" y2="12"></line>
        <line x1="12" y1="16" x2="12.01" y2="16"></line>
      </svg>
    </div>
    <h3 class="state-message-title">Failed to fetch Repository</h3>
    <p class="state-message-desc">${escapeHTML(message)}</p>
  `;
  elements.board().appendChild(errDiv);
  
  // Hide load more button
  elements.loadMoreContainer().style.display = 'none';
}

/**
 * Renders an Empty/Introduction overlay in the board container
 */
export function showEmptyState(message) {
  clearColumns();
  elements.board().style.display = 'block';
  elements.board().querySelectorAll('.state-message').forEach(el => el.remove());
  
  const emptyDiv = document.createElement('div');
  emptyDiv.className = 'state-message animate-fade-in';
  emptyDiv.innerHTML = `
    <div class="state-message-icon">
      <svg stroke="currentColor" fill="none" stroke-width="2" viewBox="0 0 24 24" width="40" height="40">
        <path d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path>
      </svg>
    </div>
    <h3 class="state-message-title">No issues to display</h3>
    <p class="state-message-desc">${escapeHTML(message)}</p>
  `;
  elements.board().appendChild(emptyDiv);
  
  // Hide load more button
  elements.loadMoreContainer().style.display = 'none';
}

/**
 * Open Inline Issue Detail Panel Drawer
 */
export function openIssueDetailPanel(issueId) {
  const issue = state.issues.find(i => i.id === Number(issueId));
  if (!issue) return;

  state.selectedIssue = issue;

  // Title
  elements.detailTitle().textContent = issue.title;

  // State Badge
  const stateBadge = elements.detailState();
  stateBadge.className = `detail-state-badge ${issue.columnId}`;
  
  let stateIcon = '';
  if (issue.columnId === 'open') {
    stateIcon = `<svg stroke="currentColor" fill="none" stroke-width="2.5" viewBox="0 0 24 24" width="12" height="12" style="margin-right:3px"><circle cx="12" cy="12" r="10"></circle><circle cx="12" cy="12" r="1"></circle></svg>`;
    stateBadge.innerHTML = `${stateIcon} Open`;
  } else if (issue.columnId === 'review') {
    stateIcon = `<svg stroke="currentColor" fill="none" stroke-width="2.5" viewBox="0 0 24 24" width="12" height="12" style="margin-right:3px"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path></svg>`;
    stateBadge.innerHTML = `${stateIcon} In Review`;
  } else {
    stateIcon = `<svg stroke="currentColor" fill="none" stroke-width="2.5" viewBox="0 0 24 24" width="12" height="12" style="margin-right:3px"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>`;
    stateBadge.innerHTML = `${stateIcon} Closed`;
  }

  // Meta info (#number, created by, comments count)
  const createdDate = new Date(issue.created_at).toLocaleDateString(undefined, { 
    month: 'short', 
    day: 'numeric', 
    year: 'numeric' 
  });
  
  elements.detailMeta().innerHTML = `
    <span>#${issue.number}</span>
    <span>opened by <strong>@${escapeHTML(issue.user?.login)}</strong> on ${createdDate}</span>
    <span>• ${issue.comments} comments</span>
  `;

  // Render Labels
  const labelsContainer = elements.detailLabels();
  if (issue.labels && issue.labels.length > 0) {
    labelsContainer.innerHTML = issue.labels.map(l => {
      const bgColor = l.color ? `#${l.color}` : 'var(--bg-tertiary)';
      const textColor = getContrastColor(l.color);
      return `<span class="badge-label" style="background-color: ${bgColor}; color: ${textColor}; font-size: 0.75rem; padding: 0.25rem 0.6rem;">${escapeHTML(l.name)}</span>`;
    }).join('');
  } else {
    labelsContainer.innerHTML = '<span style="color: var(--text-muted); font-size: 0.85rem; font-style: italic;">No labels assigned</span>';
  }

  // Assignee Detail
  const assigneeContainer = elements.detailAssignee();
  if (issue.assignee) {
    assigneeContainer.innerHTML = `
      <div class="detail-assignee-card">
        <img src="${issue.assignee.avatar_url}" class="avatar" alt="${escapeHTML(issue.assignee.login)}" style="width: 32px; height: 32px;" />
        <div>
          <div class="detail-assignee-name">@${escapeHTML(issue.assignee.login)}</div>
          <div class="detail-assignee-login">Assigned Developer</div>
        </div>
      </div>
    `;
  } else {
    assigneeContainer.innerHTML = '<span style="color: var(--text-muted); font-size: 0.85rem; font-style: italic;">No assignee</span>';
  }

  // Rendering markdown / body
  const bodyContainer = elements.detailBody();
  if (issue.body) {
    // Simple, performant text renderer with basic markdown blocks support
    // (escapes XSS, parses pre blocks, bold, lists)
    let parsedBody = escapeHTML(issue.body);
    
    // Bold block parsing
    parsedBody = parsedBody.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    
    // Inline code blocks
    parsedBody = parsedBody.replace(/`(.*?)`/g, '<code>$1</code>');
    
    // Image embeds
    parsedBody = parsedBody.replace(/!\[(.*?)\]\((.*?)\)/g, '<img src="$2" alt="$1" style="max-width:100%; border-radius: var(--radius-sm); margin:0.5rem 0;" />');

    // Code blocks parser
    parsedBody = parsedBody.replace(/```([\s\S]*?)```/g, '<pre><code>$1</code></pre>');
    
    bodyContainer.innerHTML = parsedBody;
    bodyContainer.classList.remove('detail-empty-body');
  } else {
    bodyContainer.innerHTML = 'No description provided.';
    bodyContainer.classList.add('detail-empty-body');
  }

  // Trigger CSS Sliding Transition
  elements.detailBackdrop().classList.add('active');
  elements.detailPanel().classList.add('active');
}

/**
 * Close Inline Issue Detail Panel Drawer
 */
export function closeIssueDetailPanel() {
  state.selectedIssue = null;
  elements.detailBackdrop().classList.remove('active');
  elements.detailPanel().classList.remove('active');
}
