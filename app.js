// Import Firebase modules (using version 11.6.1)
import { auth, db } from './firebase-config.js';
import {
    signInWithEmailAndPassword,
    onAuthStateChanged,
    signOut
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import {
    collection,
    addDoc,
    getDocs,
    doc,
    getDoc,
    updateDoc,
    serverTimestamp,
    query,
    orderBy,
    where,
    deleteDoc // Ensure deleteDoc is imported
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// --- Helper Functions ---
/**
 * Shows an HTML element by removing the 'display: none' style.
 * @param {HTMLElement} el - The element to show.
 */
function show(el) { if (el) el.style.display = ''; }

/**
 * Hides an HTML element by setting 'display: none'.
 * @param {HTMLElement} el - The element to hide.
 */
function hide(el) { if (el) el.style.display = 'none'; }

/**
 * Sets the text content of an HTML element.
 * @param {HTMLElement} el - The element to set text for.
 * @param {string} text - The text to set.
 */
function setText(el, text) { if (el) el.textContent = text; }

/**
 * Resets a form element.
 * @param {HTMLFormElement} form - The form to reset.
 */
function clearInputs(form) { if (form) form.reset(); }

/**
 * Escapes HTML special characters to prevent XSS.
 * @param {string} unsafe - The potentially unsafe string.
 * @returns {string} The escaped string.
 */
function escapeHtml(unsafe) {
    if (typeof unsafe !== 'string') return unsafe;
    return unsafe
         .replace(/&/g, "&amp;")
         .replace(/</g, "&lt;")
         .replace(/>/g, "&gt;")
         .replace(/"/g, "&quot;")
         .replace(/'/g, "&#039;");
}

/**
 * Creates a debounced function that delays invoking func until after wait milliseconds
 * have elapsed since the last time the debounced function was invoked.
 * @param {Function} func - The function to debounce.
 * @param {number} wait - The number of milliseconds to delay.
 * @returns {Function} The new debounced function.
 */
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
};


// --- Routing Logic ---
// Check if the current page is the login page
const isLoginPage = window.location.pathname.endsWith('login.html');
// Assume any other page is the dashboard
const isDashboard = !isLoginPage;

// --- Auth State Protection ---
// Listen for changes in authentication state
onAuthStateChanged(auth, user => {
    console.log("Auth state changed. User:", user);
    if (isLoginPage && user) {
        // If on login page and user is logged in, redirect to dashboard
        console.log("User logged in, redirecting from login to dashboard.");
        window.location.replace('index.html');
    } else if (isDashboard && !user) {
        // If on dashboard page and user is not logged in, redirect to login
        console.log("User not logged in, redirecting from dashboard to login.");
        window.location.replace('login.html');
    } else if (isDashboard && user) {
        // If on dashboard page and user is logged in, initialize the dashboard
        console.log("User logged in on dashboard page. Initializing dashboard...");
        // Use a flag to prevent multiple initializations if auth state changes rapidly
        if (!window.dashboardInitialized) {
             initializeDashboard(user); // Pass the user object
             window.dashboardInitialized = true; // Set the flag
        }
    }
});

// --- Login Page Logic ---
if (isLoginPage) {
    // Get login form elements
    const loginForm = document.getElementById('loginForm');
    const loginBtn = document.getElementById('loginBtn');
    const loginError = document.getElementById('loginError');
    const loginLoader = document.getElementById('loginLoader');

    if (loginForm) {
        // Add submit event listener to the login form
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault(); // Prevent default form submission
            // Reset UI states
            hide(loginError);
            setText(loginError, '');
            show(loginLoader);
            loginBtn.disabled = true;

            // Get email and password from the form
            const email = loginForm.email.value.trim();
            const password = loginForm.password.value;

            try {
                // Attempt to sign in with Firebase Auth
                console.log(`Attempting login for: ${email}`);
                await signInWithEmailAndPassword(auth, email, password);
                console.log("Login successful.");
                // Redirect is handled by the onAuthStateChanged listener
            } catch (err) {
                // Handle login errors
                console.error("Login failed:", err);
                let message = 'Login failed. Please check your email and password.';
                // Provide more specific error messages based on Firebase error codes
                if (err.code === 'auth/user-not-found' || err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential') {
                    message = 'Invalid email or password.';
                } else if (err.code === 'auth/invalid-email') {
                    message = 'Please enter a valid email address.';
                }
                // Display error message and reset UI
                setText(loginError, message);
                show(loginError);
                hide(loginLoader);
                loginBtn.disabled = false;
            }
        });
    } else {
        console.error("Login form not found!");
    }
}

// --- Dashboard Logic ---
/**
 * Initializes the dashboard functionality after user is authenticated.
 * @param {object} currentUser - The Firebase user object.
 */
function initializeDashboard(currentUser) {
    // Validate user object
    if (!currentUser || !currentUser.uid) {
        console.error("Dashboard initialization called without a valid user. Aborting.");
        window.location.replace('login.html'); // Redirect if user is invalid
        return;
    }
    const currentUserId = currentUser.uid; // Store the user ID
    console.log(`Initializing dashboard elements and listeners for user: ${currentUserId}`);

    // Get references to all necessary DOM elements
    const logoutBtn = document.getElementById('logoutBtn');
    const tasksList = document.getElementById('tasksList');
    const noTasksMessage = document.getElementById('noTasksMessage');
    const noFilteredTasksMessage = document.getElementById('noFilteredTasksMessage');
    const addTaskBtnNav = document.getElementById('addTaskBtnNav'); // Navbar button
    const addTaskBtnFab = document.getElementById('addTaskBtnFab'); // FAB button
    const taskModal = document.getElementById('taskModal');
    const taskForm = document.getElementById('taskForm');
    const cancelTaskBtn = document.getElementById('cancelTaskBtn');
    const submitTaskBtn = document.getElementById('submitTaskBtn'); // Button in modal footer
    const taskError = document.getElementById('taskError');
    const taskLoader = document.getElementById('taskLoader');
    const addDetailBtn = document.getElementById('addDetailBtn');
    const taskDetailsList = document.getElementById('taskDetailsList');
    const modalHeader = document.getElementById('modalHeader');
    const taskDetailModal = document.getElementById('taskDetailModal');
    const taskDetailsContent = document.getElementById('taskDetailsContent');
    const closeDetailBtn = document.getElementById('closeDetailBtn');
    const welcomeMessageEl = document.getElementById('welcomeMessage');
    const searchInput = document.getElementById('searchInput');
    const statusFilter = document.getElementById('statusFilter');
    // Note: Delete and Edit buttons within modals are retrieved later

    // State variables
    let editingTaskId = null; // Track if we are editing an existing task
    let allUserTasks = []; // Cache for all tasks fetched for the user
    let currentSearchTerm = ''; // Current search input value
    let currentStatusFilter = 'all'; // Current status filter value

    // --- Check if essential elements exist ---
    console.log("DEBUG: Checking FAB element:", addTaskBtnFab); // Debug log
    if (!logoutBtn || !tasksList || !addTaskBtnNav || !addTaskBtnFab || !taskModal || !taskForm || !taskDetailModal || !welcomeMessageEl || !searchInput || !statusFilter) {
        console.error("One or more dashboard elements could not be found. Aborting initialization.");
        return; // Stop initialization if elements are missing
    }

    // --- Initial Setup ---
    // Display the personalized welcome message
    setText(welcomeMessageEl, `Welcome, ${escapeHtml(currentUser.email)}!`);

    // --- Event Listeners ---

    // Logout Button
    logoutBtn.addEventListener('click', async () => {
        try {
            await signOut(auth);
            console.log("User signed out.");
            window.dashboardInitialized = false; // Reset initialization flag
            // Redirect is handled by onAuthStateChanged
        } catch (error) {
            console.error("Error signing out:", error);
        }
    });

    // Modal helper functions (using Tailwind classes)
    function openModal(modalElement) {
        if (modalElement) {
            console.log("DEBUG: Opening modal:", modalElement.id); // Log which modal is opening
            modalElement.classList.remove('hidden');
            modalElement.classList.add('flex'); // Use flex for centering
            // Delay opacity transition for smooth effect
            setTimeout(() => modalElement.classList.remove('opacity-0'), 10);
        } else {
             console.error("DEBUG: Attempted to open a null modal element.");
        }
    }
    function closeModal(modalElement) {
        if (modalElement) {
            console.log("DEBUG: Closing modal:", modalElement.id); // Log which modal is closing
            modalElement.classList.add('opacity-0');
            // Wait for opacity transition before hiding completely
            setTimeout(() => {
                 modalElement.classList.add('hidden');
                 modalElement.classList.remove('flex');
            }, 250); // Match transition duration in CSS/HTML
        } else {
            console.error("DEBUG: Attempted to close a null modal element.");
        }
    }

    // Function to open the Add/Edit Task modal in "Add" mode
    const openAddTaskModal = () => {
        console.log("DEBUG: openAddTaskModal called!"); // Debug log
        editingTaskId = null; // Ensure we are not in edit mode
        setText(modalHeader, 'Add New Task'); // Set modal title
        clearInputs(taskForm); // Reset the form
        setText(taskError, ''); // Clear previous errors
        hide(taskLoader); // Hide loader
        submitTaskBtn.disabled = false; // Enable submit button
        // Ensure at least one detail input field exists
        taskDetailsList.innerHTML = '<input type="text" class="task-detail-input" required placeholder="Detail 1">';
        openModal(taskModal); // Show the modal
    };

    // Attach the same handler to BOTH Add Task buttons (Nav and FAB)
    if (addTaskBtnNav) {
        console.log("DEBUG: Attaching listener to Nav button.");
        addTaskBtnNav.addEventListener('click', openAddTaskModal);
    }
    if (addTaskBtnFab) {
        console.log("DEBUG: Attaching listener to FAB button.");
        addTaskBtnFab.addEventListener('click', openAddTaskModal);
    }

    // Cancel button in Add/Edit modal
    cancelTaskBtn.addEventListener('click', () => closeModal(taskModal));

    // Button to add more task detail input fields
    addDetailBtn.addEventListener('click', () => {
        const count = taskDetailsList.querySelectorAll('.task-detail-input').length + 1;
        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'task-detail-input'; // Apply styling
        input.required = true;
        input.placeholder = `Detail ${count}`;
        taskDetailsList.appendChild(input);
        input.focus(); // Focus the new input field
    });

    // Trigger form submission when the footer submit button is clicked
    submitTaskBtn.addEventListener('click', () => {
        taskForm.requestSubmit(); // Programmatically triggers the form's submit event
    });

    // Handle the actual form submission (for both Add and Edit)
    taskForm.addEventListener('submit', async (e) => {
        e.preventDefault(); // Prevent default browser submission
        // Reset UI
        hide(taskError);
        setText(taskError, '');
        show(taskLoader);
        submitTaskBtn.disabled = true; // Disable button during processing

        // Collect task details from all input fields
        const details = Array.from(taskDetailsList.querySelectorAll('.task-detail-input'))
                             .map(input => input.value.trim())
                             .filter(detail => detail); // Filter out empty strings

        // Construct the data object to save to Firestore
        const taskData = {
            taskName: taskForm.taskName.value.trim(),
            clientName: taskForm.clientName.value.trim(),
            email: taskForm.contactEmail.value.trim(),
            phone: taskForm.contactPhone.value.trim(),
            taskDetails: details,
            dueDate: taskForm.dueDate.value, // Stored as YYYY-MM-DD string
            status: taskForm.status.value,
            updatedAt: serverTimestamp() // Always update the 'updatedAt' timestamp
        };

        try {
            console.log("Submitting task. Checking db object:", db);
            if (!db) throw new Error("Firestore db object is not available."); // Ensure db is ready

            if (editingTaskId) {
                // --- Update existing task ---
                console.log(`Updating task ID: ${editingTaskId}`);
                const docRef = doc(db, 'tasks', editingTaskId);
                // Security rules should prevent unauthorized updates
                await updateDoc(docRef, taskData);
                console.log("Task updated successfully.");
            } else {
                // --- Add new task ---
                console.log("Adding new task.");
                // Add the current user's ID and creation timestamp
                taskData.userId = currentUserId;
                taskData.createdAt = serverTimestamp();
                await addDoc(collection(db, 'tasks'), taskData);
                console.log("Task added successfully.");
            }
            closeModal(taskModal); // Close the modal on success
            await fetchAndStoreTasks(); // Re-fetch all tasks to update the local cache
            renderFilteredTasks(); // Re-render the list with current filters applied
        } catch (err) {
            // Handle errors during Firestore operation
            console.error("Error saving task:", err);
            setText(taskError, `Failed to save task: ${err.message}`);
            show(taskError);
        } finally {
            // Reset UI state regardless of success or failure
            hide(taskLoader);
            submitTaskBtn.disabled = false; // Re-enable the submit button
            editingTaskId = null; // Reset editing state
        }
    });


    // --- Search and Filter Logic ---

    // Debounced search input handler
    const handleSearch = debounce(() => {
        currentSearchTerm = searchInput.value.toLowerCase().trim();
        console.log("Search term:", currentSearchTerm);
        renderFilteredTasks(); // Re-render the list based on the new search term
    }, 300); // Debounce by 300ms

    // Attach listener to search input
    searchInput.addEventListener('input', handleSearch);

    // Status filter dropdown handler
    statusFilter.addEventListener('change', () => {
        currentStatusFilter = statusFilter.value;
        console.log("Status filter:", currentStatusFilter);
        renderFilteredTasks(); // Re-render the list based on the new status filter
    });

    /**
     * Filters the locally stored tasks (allUserTasks) based on current
     * search term and status filter, then renders the results.
     */
    function renderFilteredTasks() {
        tasksList.innerHTML = ''; // Clear the current list display
        // Hide messages initially
        hide(noTasksMessage);
        hide(noFilteredTasksMessage);

        const searchTerm = currentSearchTerm;
        const status = currentStatusFilter;

        // Filter the cached tasks array
        const filteredTasks = allUserTasks.filter(task => {
            // Check if status matches (or 'all' is selected)
            const matchesStatus = status === 'all' || task.status === status;
            // Check if search term matches task name or client name (case-insensitive)
            const matchesSearch = !searchTerm ||
                                  task.taskName.toLowerCase().includes(searchTerm) ||
                                  task.clientName.toLowerCase().includes(searchTerm);
                                  // Can add more fields to search here (e.g., task.email)

            return matchesStatus && matchesSearch; // Task must match both filters
        });

        console.log(`Rendering ${filteredTasks.length} filtered tasks.`);

        // Display appropriate message or render task cards
        if (allUserTasks.length === 0) {
             show(noTasksMessage); // Show if the user has no tasks at all
        } else if (filteredTasks.length === 0) {
            show(noFilteredTasksMessage); // Show if filters result in zero matches
        } else {
            // Render a card for each filtered task
            filteredTasks.forEach(task => {
                renderTaskCard(task, task.id); // Pass the full task object and its ID
            });
        }
    }


    // --- Data Fetching and Rendering ---

    /**
     * Fetches all tasks for the current user from Firestore,
     * stores them in the `allUserTasks` array, and triggers an initial render.
     */
    async function fetchAndStoreTasks() {
        console.log(`Fetching ALL tasks from Firestore for user: ${currentUserId}`);
        allUserTasks = []; // Clear the local cache before fetching

        try {
            console.log("Fetching tasks. Checking db object:", db);
            if (!db) throw new Error("Firestore db object is not available."); // Ensure db is ready

            // Construct the Firestore query: tasks for the current user, ordered by creation date
            const q = query(
                collection(db, 'tasks'),
                where("userId", "==", currentUserId), // Filter by user ID
                orderBy('createdAt', 'desc') // Order newest first
            );
            const querySnapshot = await getDocs(q); // Execute the query

            if (querySnapshot.empty) {
                console.log("No tasks found for this user in Firestore.");
            } else {
                 console.log(`Fetched ${querySnapshot.size} total tasks for this user.`);
                 // Populate the local cache with task data and document ID
                 querySnapshot.forEach((docSnap) => {
                    allUserTasks.push({ id: docSnap.id, ...docSnap.data() });
                 });
            }
            // Perform the initial rendering based on fetched data and default filters
            renderFilteredTasks();

        } catch (error) {
            // Handle errors during fetching
            console.error("Error fetching tasks:", error);
            tasksList.innerHTML = '<div class="text-center text-red-600 col-span-full">Error loading tasks. Please try again later.</div>';
            // Ensure messages are hidden if there's an error
            hide(noTasksMessage);
            hide(noFilteredTasksMessage);
        }
    }

    /**
     * Renders a single task card HTML element.
     * @param {object} task - The task data object (including id).
     * @param {string} taskId - The Firestore document ID for the task.
     */
    function renderTaskCard(task, taskId) {
        const card = document.createElement('div');
        // Apply Tailwind classes for styling and hover effects
        card.className = 'bg-white rounded-lg shadow-md overflow-hidden cursor-pointer transition transform hover:scale-[1.03] duration-150 ease-in-out border-l-4';
        // Set left border color based on task status
        card.style.borderLeftColor = getStatusColor(task.status);

        // Format due date for display (handle potential timezone issues)
        const formattedDueDate = task.dueDate ? new Date(task.dueDate + 'T00:00:00').toLocaleDateString() : 'N/A';
        // Generate CSS class for the status badge
        const statusClass = `status-badge-${task.status.toLowerCase().replace(/\s+/g, '-')}`;

        // Set the inner HTML of the card using template literals
        card.innerHTML = `
            <div class="p-4">
                <div class="text-base font-semibold text-gray-800 mb-1 truncate" style="color: #002147;">${escapeHtml(task.taskName)}</div>
                <div class="text-xs text-gray-600 mb-2">Client: ${escapeHtml(task.clientName)}</div>
                <div class="flex justify-between items-center text-xs text-gray-500">
                    <span>Due: ${formattedDueDate}</span>
                    <span class="px-2 py-0.5 rounded-full font-medium text-xs ${statusClass}">
                        ${escapeHtml(task.status)}
                    </span>
                </div>
            </div>
        `;
        // Add click listener to open the detail modal for this task
        card.addEventListener('click', () => openTaskDetailModal(taskId));
        tasksList.appendChild(card); // Add the card to the list container
    }

    /**
     * Returns a hex color code based on the task status.
     * @param {string} status - The task status ('Pending', 'In Progress', 'Completed').
     * @returns {string} The corresponding color code.
     */
    function getStatusColor(status) {
        switch (status) {
            case 'Pending': return '#9ca3af'; // gray-400
            case 'In Progress': return '#f59e0b'; // amber-500
            case 'Completed': return '#10b981'; // emerald-500
            default: return '#6b7280'; // gray-500 (fallback)
        }
    }

    /**
     * Fetches details for a specific task and opens the detail modal.
     * @param {string} taskId - The Firestore document ID of the task.
     */
    async function openTaskDetailModal(taskId) {
        console.log(`Opening details for task ID: ${taskId}`);
        // Clear previous content and show loader
        taskDetailsContent.innerHTML = '<div class="text-center py-4"><div class="loader"></div></div>';
        // Ensure buttons from previous modal instance don't retain old listeners
        const existingDeleteBtn = taskDetailModal.querySelector('#deleteTaskBtn');
        const existingEditBtn = taskDetailModal.querySelector('#editTaskBtn');
        if (existingDeleteBtn) existingDeleteBtn.onclick = null;
        if (existingEditBtn) existingEditBtn.onclick = null;

        openModal(taskDetailModal); // Show the modal

        try {
             console.log("Opening task detail. Checking db object:", db);
             if (!db) throw new Error("Firestore db object is not available."); // Ensure db is ready

            const docRef = doc(db, 'tasks', taskId); // Get reference to the specific task document
            const docSnap = await getDoc(docRef); // Fetch the document

            if (docSnap.exists()) {
                const task = docSnap.data();
                // --- Security Check ---
                // Verify the fetched task actually belongs to the logged-in user
                if (task.userId === currentUserId) {
                    renderTaskDetails(task, taskId); // Render details if user owns the task
                } else {
                    // If user doesn't own the task, show access denied message
                    console.warn(`Attempted to open details for task ${taskId} which does not belong to user ${currentUserId}.`);
                    taskDetailsContent.innerHTML = '<div class="text-center text-red-600 py-4">Access Denied.</div>';
                     // Hide Edit/Delete buttons in the footer
                     const deleteBtn = taskDetailModal.querySelector('#deleteTaskBtn');
                     const editBtn = taskDetailModal.querySelector('#editTaskBtn');
                     if(deleteBtn) hide(deleteBtn);
                     if(editBtn) hide(editBtn);
                }
            } else {
                // Handle case where the task document doesn't exist
                console.log("Task not found.");
                taskDetailsContent.innerHTML = '<div class="text-center text-red-600 py-4">Task not found.</div>';
            }
        } catch (error) {
            // Handle errors during fetching
            console.error("Error fetching task details:", error);
            taskDetailsContent.innerHTML = '<div class="text-center text-red-600 py-4">Error loading details.</div>';
        }
    }

    /**
     * Renders the task details inside the detail modal and attaches listeners
     * to the Edit and Delete buttons in the modal's footer.
     * @param {object} task - The task data object.
     * @param {string} taskId - The Firestore document ID of the task.
     */
    function renderTaskDetails(task, taskId) {
        const formattedDueDate = task.dueDate ? new Date(task.dueDate + 'T00:00:00').toLocaleDateString() : 'N/A';
        const statusClass = `status-badge-${task.status.toLowerCase().replace(/\s+/g, '-')}`;

        // Generate HTML for the list of task details
        let detailsHtml = 'Not provided';
        if (Array.isArray(task.taskDetails) && task.taskDetails.length > 0) {
            detailsHtml = '<ul class="list-disc list-inside pl-4 mt-1 space-y-1">';
            task.taskDetails.forEach(detail => {
                detailsHtml += `<li>${escapeHtml(detail)}</li>`;
            });
            detailsHtml += '</ul>';
        } else if (typeof task.taskDetails === 'string' && task.taskDetails) {
             // Handle case where details might be a single string (older format?)
             detailsHtml = `<p class="mt-1">${escapeHtml(task.taskDetails)}</p>`;
        }

        // Set the inner HTML of the modal's content area
        taskDetailsContent.innerHTML = `
            <div class="space-y-2">
                <div><strong>Task Name:</strong> ${escapeHtml(task.taskName)}</div>
                <div><strong>Client Name:</strong> ${escapeHtml(task.clientName)}</div>
                <div><strong>Email:</strong> <a href="mailto:${escapeHtml(task.email)}" class="text-blue-600 hover:underline">${escapeHtml(task.email)}</a></div>
                <div><strong>Phone:</strong> <a href="tel:${escapeHtml(task.phone)}" class="text-blue-600 hover:underline">${escapeHtml(task.phone)}</a></div>
                <div><strong>Task Details:</strong> ${detailsHtml}</div>
                <div><strong>Due Date:</strong> ${formattedDueDate}</div>
                <div><strong>Status:</strong> <span class="px-2 py-0.5 text-xs rounded-full font-medium ${statusClass}">${escapeHtml(task.status)}</span></div>
            </div>
        `;

        // Get buttons from the modal footer (they are persistent elements)
        const editBtn = taskDetailModal.querySelector('#editTaskBtn');
        const deleteBtn = taskDetailModal.querySelector('#deleteTaskBtn');

        // Attach listener to Edit button
        if (editBtn) {
            show(editBtn); // Ensure button is visible
            // Pass the current task data and ID to the edit modal opener
            editBtn.onclick = () => openEditTaskModal(task, taskId);
        } else {
            console.error("Edit button not found in detail modal footer");
        }

        // Attach listener to Delete button
        if (deleteBtn) {
            show(deleteBtn); // Ensure button is visible
            deleteBtn.onclick = () => deleteTask(taskId); // Call delete function with task ID
        } else {
             console.error("Delete button not found in detail modal footer");
        }
    }

    /**
     * Handles the deletion of a task after confirmation.
     * @param {string} taskId - The Firestore document ID of the task to delete.
     */
    async function deleteTask(taskId) {
        // Show confirmation dialog before proceeding
        if (!confirm("Are you sure you want to delete this task? This action cannot be undone.")) {
            return; // Stop if user clicks Cancel
        }

        console.log(`Attempting to delete task ID: ${taskId}`);
        // TODO: Optionally add a loading indicator specifically for deletion

        try {
            if (!db) throw new Error("Firestore db object is not available."); // Ensure db is ready

            const docRef = doc(db, 'tasks', taskId); // Get reference to the document
            await deleteDoc(docRef); // Delete the document from Firestore

            console.log("Task deleted successfully.");
            closeModal(taskDetailModal); // Close the detail modal

            // --- Update UI Immediately ---
            // Remove the deleted task from the local cache
            allUserTasks = allUserTasks.filter(task => task.id !== taskId);
            // Re-render the task list from the updated cache
            renderFilteredTasks();

            // TODO: Optionally show a temporary success message (e.g., a toast notification)

        } catch (error) {
            // Handle errors during deletion
            console.error("Error deleting task:", error);
            // Show error message to the user
            alert(`Failed to delete task: ${error.message}`); // Replace alert with better UI later
        } finally {
            // TODO: Hide deletion loading indicator if one was added
        }
    }

    /**
     * Opens the Add/Edit modal in "Edit" mode, pre-filling the form.
     * @param {object} task - The task data object to edit.
     * @param {string} taskId - The Firestore document ID of the task.
     */
    function openEditTaskModal(task, taskId) {
        // --- Security Check ---
        // Double-check ownership before allowing edit modal to open
        if (task.userId !== currentUserId) {
             console.warn(`Attempted to edit task ${taskId} which does not belong to user ${currentUserId}.`);
             alert("You do not have permission to edit this task."); // Inform user
             return; // Prevent modal from opening
        }

        console.log(`Opening edit modal for task ID: ${taskId}`);
        editingTaskId = taskId; // Set the state to indicate we are editing
        setText(modalHeader, 'Edit Task'); // Set modal title

        // Pre-fill form fields with existing task data
        taskForm.taskName.value = task.taskName || '';
        taskForm.clientName.value = task.clientName || '';
        taskForm.contactEmail.value = task.email || '';
        taskForm.contactPhone.value = task.phone || '';
        taskForm.dueDate.value = task.dueDate || '';
        taskForm.status.value = task.status || 'Pending'; // Default to Pending if status is missing

        // Pre-fill task details input fields
        taskDetailsList.innerHTML = ''; // Clear any previous detail inputs
        if (Array.isArray(task.taskDetails) && task.taskDetails.length > 0) {
            // Create an input for each existing detail
            task.taskDetails.forEach((detail, index) => {
                const input = document.createElement('input');
                input.type = 'text';
                input.className = 'task-detail-input';
                input.required = true;
                input.value = detail;
                input.placeholder = `Detail ${index + 1}`;
                taskDetailsList.appendChild(input);
            });
        } else {
            // If no details exist, add one empty input field
            taskDetailsList.innerHTML = '<input type="text" class="task-detail-input" required placeholder="Detail 1">';
        }

        // Reset UI states for the modal
        setText(taskError, '');
        hide(taskLoader);
        submitTaskBtn.disabled = false; // Ensure submit button is enabled

        closeModal(taskDetailModal); // Close the detail modal if it was open
        openModal(taskModal); // Open the Add/Edit modal
    }

    // Close button listener for the Task Detail modal
    closeDetailBtn.addEventListener('click', () => closeModal(taskDetailModal));

    // --- Initial Data Fetch ---
    // Fetch tasks only if the user ID is valid
    if (currentUserId) {
        fetchAndStoreTasks(); // Fetch all tasks for the user when the dashboard initializes
    } else {
        console.error("Cannot fetch tasks, user ID is missing.");
    }

    console.log("Dashboard initialization complete.");
} // End of initializeDashboard function
