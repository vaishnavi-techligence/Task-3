/**
 * API Handler Module
 * Handles all communication with GitHub REST API using modern async/await, Promise.all, and Promise.race timeouts.
 */

import { state } from './state.js';

// Base API URL
const BASE_URL = 'https://api.github.com';

/**
 * Custom fetch with timeout using Promise.race and AbortController
 */
async function fetchWithTimeout(url, options = {}, timeoutMs = 8000) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  const fetchPromise = fetch(url, {
    ...options,
    signal: controller.signal
  });

  const timeoutPromise = new Promise((_, reject) =>
    setTimeout(() => reject(new Error('Request timed out')), timeoutMs)
  );

  try {
    // Race the fetch call against the timeout promise
    const response = await Promise.race([fetchPromise, timeoutPromise]);
    return response;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Build request headers, including Personal Access Token if provided
 */
function getHeaders() {
  const headers = {
    'Accept': 'application/vnd.github.v3+json',
  };
  
  if (state.token) {
    headers['Authorization'] = `token ${state.token}`;
  }
  
  return headers;
}

/**
 * Handle API error responses gracefully, throwing specific errors for UI to handle
 */
async function handleResponseError(response) {
  if (response.ok) return;

  const status = response.status;
  let message = 'An unexpected error occurred';
  
  try {
    const errorData = await response.json();
    message = errorData.message || message;
  } catch (e) {
    // Fallback if response is not JSON
  }

  // Rate Limiting Error
  if (status === 403 && response.headers.get('x-ratelimit-remaining') === '0') {
    const resetTimeEpoch = response.headers.get('x-ratelimit-reset');
    const resetDate = resetTimeEpoch ? new Date(Number(resetTimeEpoch) * 1000) : null;
    const resetTimeString = resetDate ? resetDate.toLocaleTimeString() : 'soon';
    
    const err = new Error(`GitHub API rate limit exceeded. Resets at ${resetTimeString}.`);
    err.status = 403;
    err.rateLimitReset = resetTimeString;
    throw err;
  }

  // Not Found Error
  if (status === 404) {
    const err = new Error('Repository not found. Please verify the "owner/repo" spelling.');
    err.status = 404;
    throw err;
  }

  const err = new Error(`${message} (Status: ${status})`);
  err.status = status;
  throw err;
}

/**
 * Fetch public repository metadata (stars, forks, open issues, description)
 */
async function fetchRepoMetadata(owner, repo) {
  const url = `${BASE_URL}/repos/${owner}/${repo}`;
  const response = await fetchWithTimeout(url, { headers: getHeaders() });
  
  await handleResponseError(response);
  return await response.json();
}

/**
 * Fetch issues with pagination
 * Fetches open and closed issues in parallel and merges them.
 */
async function fetchRepoIssues(owner, repo, page = 1, perPage = 10) {
  const openUrl = `${BASE_URL}/repos/${owner}/${repo}/issues?state=open&page=${page}&per_page=${perPage}`;
  const closedUrl = `${BASE_URL}/repos/${owner}/${repo}/issues?state=closed&page=${page}&per_page=${perPage}`;
  
  const [openRes, closedRes] = await Promise.all([
    fetchWithTimeout(openUrl, { headers: getHeaders() }),
    fetchWithTimeout(closedUrl, { headers: getHeaders() })
  ]);
  
  await handleResponseError(openRes);
  await handleResponseError(closedRes);
  
  const openIssues = await openRes.json();
  const closedIssues = await closedRes.json();
  
  return {
    rawIssues: [...openIssues, ...closedIssues],
    hasMore: (openIssues.length === perPage) || (closedIssues.length === perPage)
  };
}

/**
 * Parallel API Fetching: Fetch repository metadata AND page 1 issues simultaneously.
 * Implements requirement 2 using Promise.all()
 */
export async function fetchInitialData(repoPath) {
  const parts = repoPath.split('/');
  if (parts.length !== 2 || !parts[0].trim() || !parts[1].trim()) {
    throw new Error('Please enter a valid repository in the format "owner/repo"');
  }

  const owner = parts[0].trim();
  const repo = parts[1].trim();

  // Execute async calls in parallel (Metadata and Issues page 1)
  const [metadata, issuesResult] = await Promise.all([
    fetchRepoMetadata(owner, repo),
    fetchRepoIssues(owner, repo, 1, state.perPage)
  ]);

  // Pull out raw pull requests
  const cleanIssues = issuesResult.rawIssues.filter(issue => !issue.pull_request);

  return {
    metadata: {
      name: metadata.full_name,
      description: metadata.description || 'No description provided.',
      stars: metadata.stargazers_count,
      forks: metadata.forks_count,
      openIssuesCount: metadata.open_issues_count,
      htmlUrl: metadata.html_url
    },
    issues: cleanIssues,
    hasMore: issuesResult.hasMore
  };
}

/**
 * Fetch subsequent pages of issues (Pagination)
 */
export async function fetchMoreIssues(repoPath, page) {
  const [owner, repo] = repoPath.split('/');
  const issuesResult = await fetchRepoIssues(owner.trim(), repo.trim(), page, state.perPage);
  
  // Filter out pull requests
  const cleanIssues = issuesResult.rawIssues.filter(issue => !issue.pull_request);
  
  return {
    issues: cleanIssues,
    hasMore: issuesResult.hasMore
  };
}

