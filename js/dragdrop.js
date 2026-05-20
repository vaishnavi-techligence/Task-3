/**
 * Drag and Drop Controller Module
 * Implements native HTML5 drag-and-drop using a robust Event Delegation architecture
 * attached to the board container rather than individual cards.
 */

import { updateIssueColumn } from './state.js';
import { updateColumnBadges } from './ui.js';

/**
 * Initialize Drag & Drop event listeners on the Kanban Board using Event Delegation
 * @param {HTMLElement} boardElement - The parent Kanban board DOM container
 */
export function initDragAndDrop(boardElement) {
  if (!boardElement) return;

  // Track drag enters to prevent flickering with nested children
  const dragEnterCounters = new Map();
  ['open', 'review', 'closed'].forEach(col => dragEnterCounters.set(col, 0));

  // 1. DRAG START (Delegated: bubbles up from issue cards - Requirement 11: closest, matches, dataset)
  boardElement.addEventListener('dragstart', (e) => {
    const card = e.target.closest('.issue-card');
    if (!card || !card.matches('.issue-card')) return;

    // Mark card visually
    card.classList.add('dragging');

    // Store the issue ID in the dataTransfer payload
    e.dataTransfer.setData('text/plain', card.dataset.id);
    e.dataTransfer.effectAllowed = 'move';
  });

  // 2. DRAG END (Delegated)
  boardElement.addEventListener('dragend', (e) => {
    const card = e.target.closest('.issue-card');
    if (card && card.matches('.issue-card')) {
      card.classList.remove('dragging');
    }
    
    // Reset all column counters and visual states
    document.querySelectorAll('.kanban-column').forEach(col => {
      col.classList.remove('drag-over');
      const colId = col.dataset.column;
      if (colId) dragEnterCounters.set(colId, 0);
    });
  });

  // 3. DRAG OVER (Delegated: required to allow dropping)
  boardElement.addEventListener('dragover', (e) => {
    const column = e.target.closest('.kanban-column');
    if (!column) return;
    
    // Prevent default browser behavior to enable dropping
    e.preventDefault();
  });

  // 4. DRAG ENTER (Delegated: visual feedback)
  boardElement.addEventListener('dragenter', (e) => {
    const column = e.target.closest('.kanban-column');
    if (!column) return;

    const columnId = column.dataset.column;
    let count = dragEnterCounters.get(columnId) || 0;
    count++;
    dragEnterCounters.set(columnId, count);

    if (count === 1) {
      column.classList.add('drag-over');
    }
  });

  // 5. DRAG LEAVE (Delegated: remove visual feedback)
  boardElement.addEventListener('dragleave', (e) => {
    const column = e.target.closest('.kanban-column');
    if (!column) return;

    const columnId = column.dataset.column;
    let count = dragEnterCounters.get(columnId) || 0;
    count--;
    dragEnterCounters.set(columnId, Math.max(0, count));

    if (count <= 0) {
      column.classList.remove('drag-over');
    }
  });

  // 6. DROP (Delegated: state persistence & card insertion)
  boardElement.addEventListener('drop', (e) => {
    e.preventDefault();
    const column = e.target.closest('.kanban-column');
    if (!column) return;

    const columnId = column.dataset.column;
    
    // Reset drag counters for this column
    dragEnterCounters.set(columnId, 0);
    column.classList.remove('drag-over');

    const issueId = e.dataTransfer.getData('text/plain');
    if (!issueId) return;

    // Update state (Frontend Memory Persistence)
    const wasUpdated = updateIssueColumn(issueId, columnId);
    
    if (wasUpdated) {
      // Visual feedback: find the card and append to target issue list directly
      const cardElement = boardElement.querySelector(`.issue-card[data-id="${issueId}"]`);
      const targetList = column.querySelector('.issue-list');
      
      if (cardElement && targetList) {
        // Appending moves the element in the DOM (high-performance direct operation)
        targetList.appendChild(cardElement);
        
        // Update the item count badges in headers
        updateColumnBadges();
      }
    }
  });
}
