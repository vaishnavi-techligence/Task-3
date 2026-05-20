/**
 * Main Application Coordinator Module
 * Orchestrates event delegation, debounces text input filtering,
 * links drag-and-drop to state changes, and coordinates API pipelines.
 */

import { state, resetStateForNewRepo, addIssues, saveToken } from './state.js';
import { fetchInitialData, fetchMoreIssues } from './api.js';
import { 
  renderRepoMetadata, 
  renderSkeletonLoaders, 
  renderBoard, 
  populateFilterDropdowns, 
  showErrorState, 
  openIssueDetailPanel, 
  closeIssueDetailPanel,
  appendIssuesToBoard,
  updateLoadMoreButton
} from './ui.js';
import { initDragAndDrop } from './dragdrop.js';

// Debounce helper to optimize keystroke-driven rendering performance
function debounce(fn, delay = 150) {
  let timeoutId;
  return function (...args) {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => fn.apply(this, args), delay);
  };
}

/**
 * Perform search for owner/repository issues
 */
async function handleSearch(repoName) {
  if (!repoName.trim()) return;

  resetStateForNewRepo(repoName);
  
  // Clear visual filter inputs in the DOM to avoid visual-state mismatches
  const kwFilter = document.getElementById('filter-keyword');
  const lblFilter = document.getElementById('filter-label');
  const asgFilter = document.getElementById('filter-assignee');
  if (kwFilter) kwFilter.value = '';
  if (lblFilter) lblFilter.value = '';
  if (asgFilter) asgFilter.value = '';

  // 1. Render Skeleton Loading UI to avoid layout shift
  renderSkeletonLoaders();
  
  state.isLoading = true;
  updateLoadMoreButton();

  try {
    // 2. Parallel Fetch: Metadata + Issues (Page 1)
    const data = await fetchInitialData(repoName);
    
    state.metadata = data.metadata;
    addIssues(data.issues);
    
    // Set hasMore based on API response
    state.hasMore = data.hasMore;

    // 3. Render loaded repository metadata dashboard
    renderRepoMetadata(state.metadata);

    // 4. Populate dynamic filtering dropdowns
    populateFilterDropdowns();

    // 5. Render board with cards
    renderBoard();

  } catch (error) {
    console.error('Initial Fetch Error:', error);
    showErrorState(error.message);
  } finally {
    state.isLoading = false;
    updateLoadMoreButton();
  }
}

/**
 * Handle Load More (Pagination)
 */
async function handleLoadMore() {
  if (state.isLoading || !state.hasMore) return;

  state.page += 1;
  state.isLoading = true;
  updateLoadMoreButton();

  try {
    const data = await fetchMoreIssues(state.repoName, state.page);
    
    state.hasMore = data.hasMore;

    // Persist new cards to state memory
    addIssues(data.issues);
    
    // Performance optimized: Append ONLY new cards to the DOM directly!
    appendIssuesToBoard(data.issues);


  } catch (error) {
    console.error('Pagination Fetch Error:', error);
    alert(`Failed to load more issues: ${error.message}`);
    state.page -= 1; // Rollback page
  } finally {
    state.isLoading = false;
    updateLoadMoreButton();
  }
}

/**
 * Initialize all Event Listeners utilizing scalable Event Delegation
 */
function setupEventDelegation() {
  // --- Repository Search Submit ---
  const searchForm = document.getElementById('search-form');
  searchForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const repoInput = document.getElementById('repo-search-input');
    handleSearch(repoInput.value);
  });

  // --- GitHub PAT Save ---
  const tokenInput = document.getElementById('pat-token-input');
  if (tokenInput) {
    // Populate cached token
    tokenInput.value = state.token;
    
    tokenInput.addEventListener('change', (e) => {
      saveToken(e.target.value);
      // Visual feedback
      e.target.style.borderColor = e.target.value.trim() ? '#3fb950' : 'var(--border-color)';
      setTimeout(() => {
        e.target.style.borderColor = 'var(--border-color)';
      }, 1000);
    });
  }

  // --- Dynamic Filtering UI listeners ---
  const keywordFilter = document.getElementById('filter-keyword');
  const labelFilter = document.getElementById('filter-label');
  const assigneeFilter = document.getElementById('filter-assignee');
  const clearFiltersBtn = document.getElementById('clear-filters');

  // Debounced search text input filtering (avoid repainting on every single keystroke)
  keywordFilter.addEventListener('input', debounce((e) => {
    state.filters.keyword = e.target.value;
    renderBoard();
  }, 200));

  labelFilter.addEventListener('change', (e) => {
    state.filters.label = e.target.value;
    renderBoard();
  });

  assigneeFilter.addEventListener('change', (e) => {
    state.filters.assignee = e.target.value;
    renderBoard();
  });

  clearFiltersBtn.addEventListener('click', () => {
    keywordFilter.value = '';
    labelFilter.value = '';
    assigneeFilter.value = '';
    
    state.filters.keyword = '';
    state.filters.label = '';
    state.filters.assignee = '';
    
    renderBoard();
  });

  // --- Load More Pagination Button ---
  const loadMoreBtn = document.getElementById('load-more-btn');
  loadMoreBtn.addEventListener('click', handleLoadMore);

  // --- Card Click and Drag Delegation on Board ---
  const board = document.getElementById('kanban-board');
  
  // Single click delegation to open detail drawer (Requirement 5 & 11: closest, matches, dataset)
  board.addEventListener('click', (e) => {
    // Only open if they clicked on or within an issue card
    const card = e.target.closest('.issue-card');
    if (card && card.matches('.issue-card') && !card.classList.contains('dragging')) {
      const issueId = card.dataset.id;
      openIssueDetailPanel(issueId);
    }
  });

  // --- Details Panel Drawer Close ---
  const closeBtn = document.getElementById('detail-close');
  const backdrop = document.getElementById('detail-backdrop');

  closeBtn.addEventListener('click', closeIssueDetailPanel);
  backdrop.addEventListener('click', closeIssueDetailPanel);
  
  // Escape key closes detail drawer
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeIssueDetailPanel();
    }
  });
}

/**
 * Bootstrap application
 */
document.addEventListener('DOMContentLoaded', () => {
  // Initialize drag-and-drop controller on the parent board container
  const board = document.getElementById('kanban-board');
  initDragAndDrop(board);

  // Bind all interaction events
  setupEventDelegation();

  // Try parsing repo from URL query parameters (e.g. ?repo=facebook/react) for bookmarking!
  const urlParams = new URLSearchParams(window.location.search);
  const repoParam = urlParams.get('repo');
  if (repoParam) {
    document.getElementById('repo-search-input').value = repoParam;
    handleSearch(repoParam);
  } else {
    // Pre-populate with a cool repository recommendation
    const recommended = 'facebook/react';
    document.getElementById('repo-search-input').value = recommended;
    handleSearch(recommended);
  }
});
