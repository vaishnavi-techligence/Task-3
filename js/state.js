/**
 * State Management Module
 * Maintains application-wide single source of truth for the Kanban issues tracker.
 */

// Key for caching GitHub token in localStorage
const TOKEN_CACHE_KEY = 'gh_issues_tracker_pat';

export const state = {
  repoName: '',
  metadata: null,
  issues: [], // List of all issues loaded so far
  page: 1,
  perPage: 10,
  hasMore: true,
  isLoading: false,
  filters: {
    keyword: '',
    label: '',
    assignee: '',
  },
  selectedIssue: null,
  token: localStorage.getItem(TOKEN_CACHE_KEY) || '',
};

/**
 * Reset state for a new repository search
 */
export function resetStateForNewRepo(repoName) {
  state.repoName = repoName;
  state.metadata = null;
  state.issues = [];
  state.page = 1;
  state.hasMore = true;
  state.isLoading = false;
  state.filters = {
    keyword: '',
    label: '',
    assignee: '',
  },
  state.selectedIssue = null;
}

/**
 * Add unique issues to state, keeping column preservation or assigning initially
 * Closed issues go to "closed".
 * Open issues go to "open" unless they have a column already assigned in our session
 */
export function addIssues(newIssues) {
  const existingMap = new Map(state.issues.map(issue => [issue.id, issue]));
  
  newIssues.forEach(issue => {
    // Determine initial column:
    // If state is closed -> closed
    // If state is open: check if it contains label like "in-progress" or "in-review"
    // otherwise default to "open"
    let initialColumn = 'open';
    if (issue.state === 'closed') {
      initialColumn = 'closed';
    } else {
      const labels = issue.labels || [];
      const hasReviewLabel = labels.some(l => 
        l.name.toLowerCase().includes('review') || 
        l.name.toLowerCase().includes('progress') || 
        l.name.toLowerCase().includes('in-work') ||
        l.name.toLowerCase().includes('wip') ||
        l.name.toLowerCase().includes('active')
      );
      const hasAssignee = !!issue.assignee;
      const hasManyLabels = labels.length > 2;

      if (hasReviewLabel || hasAssignee || hasManyLabels) {
        initialColumn = 'review';
      }
    }

    if (!existingMap.has(issue.id)) {
      state.issues.push({
        ...issue,
        columnId: initialColumn // frontend state property
      });
    }
  });
}

/**
 * Update the column ID for an issue when dragged and dropped
 */
export function updateIssueColumn(issueId, newColumnId) {
  const issue = state.issues.find(i => i.id === Number(issueId));
  if (issue) {
    issue.columnId = newColumnId;
    return true;
  }
  return false;
}

/**
 * Save Personal Access Token
 */
export function saveToken(token) {
  state.token = token.trim();
  if (state.token) {
    localStorage.setItem(TOKEN_CACHE_KEY, state.token);
  } else {
    localStorage.removeItem(TOKEN_CACHE_KEY);
  }
}

/**
 * Get distinct labels and assignees from currently loaded issues to build filters list
 */
export function getFilterOptions() {
  const labelsSet = new Set();
  const assigneesMap = new Map(); // login -> avatar_url

  state.issues.forEach(issue => {
    if (issue.labels) {
      issue.labels.forEach(l => labelsSet.add(l.name));
    }
    if (issue.assignee) {
      assigneesMap.set(issue.assignee.login, issue.assignee.avatar_url);
    }
    if (issue.assignees) {
      issue.assignees.forEach(a => assigneesMap.set(a.login, a.avatar_url));
    }
  });

  return {
    labels: Array.from(labelsSet).sort(),
    assignees: Array.from(assigneesMap.entries()).map(([login, avatarUrl]) => ({
      login,
      avatarUrl
    })).sort((a, b) => a.login.localeCompare(b.login))
  };
}

/**
 * Check if a single issue matches the currently active filter settings
 */
export function matchesActiveFilters(issue) {
  // Keyword match (title, body, or number)
  if (state.filters.keyword) {
    const kw = state.filters.keyword.toLowerCase();
    const titleMatch = issue.title?.toLowerCase().includes(kw);
    const bodyMatch = issue.body?.toLowerCase().includes(kw);
    const numberMatch = String(issue.number) === kw;
    if (!titleMatch && !bodyMatch && !numberMatch) {
      return false;
    }
  }

  // Label match
  if (state.filters.label) {
    const hasLabel = issue.labels?.some(l => l.name === state.filters.label);
    if (!hasLabel) {
      return false;
    }
  }

  // Assignee match
  if (state.filters.assignee) {
    const hasAssignee = issue.assignee?.login === state.filters.assignee || 
                        issue.assignees?.some(a => a.login === state.filters.assignee);
    if (!hasAssignee) {
      return false;
    }
  }

  return true;
}

/**
 * Filter issues according to the selected filter state
 */
export function getFilteredIssues() {
  return state.issues.filter(matchesActiveFilters);
}

