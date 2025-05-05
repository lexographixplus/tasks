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
    deleteDoc
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// --- Helper Functions ---
function show(el) { if (el) el.style.display = ''; }
function hide(el) { if (el) el.style.display = 'none'; }
function setText(el, text) { if (el) el.textContent = text; }
function clearInputs(form) { if (form) form.reset(); }
function escapeHtml(unsafe) {
    if (typeof unsafe !== 'string') return unsafe;
    return unsafe
         .replace(/&/g, "&amp;")
         .replace(/</g, "&lt;")
         .replace(/>/g, "&gt;")
         .replace(/"/g, "&quot;")
         .replace(/'/g, "&#039;");
}
// Debounce function
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
const isLoginPage = window.location.pathname.endsWith('login.html');
const isDashboard = !isLoginPage;

// --- Auth State Protection ---
onAuthStateChanged(auth, user => {
    console.log("Auth state changed. User:", user);
    if (isLoginPage && user) {
        console.log("User logged in, redirecting from login to dashboard.");
        window.location.replace('index.html');
    } else if (isDashboard && !user) {
        console.log("User not logged in, redirecting from dashboard to login.");
        window.location.replace('login.html');
    } else if (isDashboard && user) {
        console.log("User logged in on dashboard page. Initializing dashboard...");
        if (!window.dashboardInitialized) {
             initializeDashboard(user);
             window.dashboardInitialized = true;
        }
    }
});

// --- Login Page Logic ---
if (isLoginPage) {
    // ... (Login logic remains the same) ...
    const loginForm = document.getElementById('loginForm');
    const loginBtn = document.getElementById('loginBtn');
    const loginError = document.getElementById('loginError');
    const loginLoader = document.getElementById('loginLoader');

    if (loginForm) {
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            hide(loginError);
            setText(loginError, '');
            show(loginLoader);
            loginBtn.disabled = true;
            const email = loginForm.email.value.trim();
            const password = loginForm.password.value;

            try {
                console.log(`Attempting login for: ${email}`);
                await signInWithEmailAndPassword(auth, email, password);
                console.log("Login successful.");
                // Redirect handled by onAuthStateChanged
            } catch (err) {
                console.error("Login failed:", err);
                let message = 'Login failed. Please check your email and password.';
                if (err.code === 'auth/user-not-found' || err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential') {
                    message = 'Invalid email or password.';
                } else if (err.code === 'auth/invalid-email') {
                    message = 'Please enter a valid email address.';
                }
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
function initializeDashboard(currentUser) {
    if (!currentUser || !currentUser.uid) {
        console.error("Dashboard initialization called without a valid user. Aborting.");
        window.location.replace('login.html');
        return;
    }
    const currentUserId = currentUser.uid;
    console.log(`Initializing dashboard elements and listeners for user: ${currentUserId}`);

    // Elements
    const logoutBtn = document.getElementById('logoutBtn');
    const tasksList = document.getElementById('tasksList');
    const noTasksMessage = document.getElementById('noTasksMessage');
    const noFilteredTasksMessage = document.getElementById('noFilteredTasksMessage'); // New message element
    const addTaskBtnNav = document.getElementById('addTaskBtnNav'); // *** Updated button ID ***
    const taskModal = document.getElementById('taskModal');
    const taskForm = document.getElementById('taskForm');
    const cancelTaskBtn = document.getElementById('cancelTaskBtn');
    const submitTaskBtn = document.getElementById('submitTaskBtn'); // Button to trigger form submission
    const taskError = document.getElementById('taskError');
    const taskLoader = document.getElementById('taskLoader');
    const addDetailBtn = document.getElementById('addDetailBtn');
    const taskDetailsList = document.getElementById('taskDetailsList');
    const modalHeader = document.getElementById('modalHeader');
    const taskDetailModal = document.getElementById('taskDetailModal');
    const taskDetailsContent = document.getElementById('taskDetailsContent');
    const closeDetailBtn = document.getElementById('closeDetailBtn');
    const welcomeMessageEl = document.getElementById('welcomeMessage'); // Welcome message element
    const searchInput = document.getElementById('searchInput'); // Search input
    const statusFilter = document.getElementById('statusFilter'); // Status filter dropdown

    // State
    let editingTaskId = null;
    let allUserTasks = []; // Array to hold all tasks fetched for the user
    let currentSearchTerm = '';
    let currentStatusFilter = 'all';

    // --- Check if elements exist ---
    if (!logoutBtn || !tasksList || !addTaskBtnNav || !taskModal || !taskForm || !taskDetailModal || !welcomeMessageEl || !searchInput || !statusFilter) {
        console.error("One or more dashboard elements could not be found. Aborting initialization.");
        return;
    }

    // --- Initial Setup ---
    // Display Welcome Message
    setText(welcomeMessageEl, `Welcome, ${escapeHtml(currentUser.email)}!`);

    // --- Event Listeners ---
    logoutBtn.addEventListener('click', async () => {
        try {
            await signOut(auth);
            console.log("User signed out.");
            window.dashboardInitialized = false;
            // Redirect handled by onAuthStateChanged
        } catch (error) {
            console.error("Error signing out:", error);
        }
    });

    // Modal helpers
    function openModal(modalElement) { /* ... (no change) ... */ }
    function closeModal(modalElement) { /* ... (no change) ... */ }
    function openModal(modalElement) {
        if (modalElement) {
            modalElement.classList.remove('hidden');
            modalElement.classList.add('flex');
            setTimeout(() => modalElement.classList.remove('opacity-0'), 10);
        }
    }
    function closeModal(modalElement) {
        if (modalElement) {
            modalElement.classList.add('opacity-0');
            setTimeout(() => {
                 modalElement.classList.add('hidden');
                 modalElement.classList.remove('flex');
            }, 250);
        }
    }


    // Open "Add Task" Modal (using the nav button)
    addTaskBtnNav.addEventListener('click', () => {
        editingTaskId = null;
        setText(modalHeader, 'Add New Task');
        clearInputs(taskForm);
        setText(taskError, '');
        hide(taskLoader);
        submitTaskBtn.disabled = false;
        taskDetailsList.innerHTML = '<input type="text" class="task-detail-input" required placeholder="Detail 1">';
        openModal(taskModal);
    });

    // Cancel/Close Add/Edit Modal
    cancelTaskBtn.addEventListener('click', () => closeModal(taskModal));

    // Add more task detail input fields
    addDetailBtn.addEventListener('click', () => { /* ... (no change) ... */ });
    addDetailBtn.addEventListener('click', () => {
        const count = taskDetailsList.querySelectorAll('.task-detail-input').length + 1;
        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'task-detail-input';
        input.required = true;
        input.placeholder = `Detail ${count}`;
        taskDetailsList.appendChild(input);
        input.focus();
    });


    // *** Trigger form submission from the modal footer button ***
    submitTaskBtn.addEventListener('click', () => {
        taskForm.requestSubmit(); // Programmatically submit the form
    });

    // Submit Task Form (Handles both Add and Edit)
    taskForm.addEventListener('submit', async (e) => {
        e.preventDefault(); // Prevent default form submission
        hide(taskError);
        setText(taskError, '');
        show(taskLoader);
        submitTaskBtn.disabled = true; // Disable footer button

        const details = Array.from(taskDetailsList.querySelectorAll('.task-detail-input'))
                             .map(input => input.value.trim())
                             .filter(detail => detail);

        const taskData = {
            taskName: taskForm.taskName.value.trim(),
            clientName: taskForm.clientName.value.trim(),
            email: taskForm.contactEmail.value.trim(),
            phone: taskForm.contactPhone.value.trim(),
            taskDetails: details,
            dueDate: taskForm.dueDate.value,
            status: taskForm.status.value,
            updatedAt: serverTimestamp()
        };

        try {
            console.log("Submitting task. Checking db object:", db);
            if (!db) throw new Error("Firestore db object is not available.");

            if (editingTaskId) {
                console.log(`Updating task ID: ${editingTaskId}`);
                const docRef = doc(db, 'tasks', editingTaskId);
                await updateDoc(docRef, taskData);
                console.log("Task updated successfully.");
            } else {
                console.log("Adding new task.");
                taskData.userId = currentUserId;
                taskData.createdAt = serverTimestamp();
                await addDoc(collection(db, 'tasks'), taskData);
                console.log("Task added successfully.");
            }
            closeModal(taskModal);
            await fetchAndStoreTasks(); // Fetch all tasks again after saving
            renderFilteredTasks(); // Re-render the list with current filters
        } catch (err) {
            console.error("Error saving task:", err);
            setText(taskError, `Failed to save task: ${err.message}`);
            show(taskError);
        } finally {
            hide(taskLoader);
            submitTaskBtn.disabled = false; // Re-enable footer button
            editingTaskId = null;
        }
    });

    // --- Search and Filter Logic ---

    // Debounced search handler
    const handleSearch = debounce(() => {
        currentSearchTerm = searchInput.value.toLowerCase().trim();
        console.log("Search term:", currentSearchTerm);
        renderFilteredTasks();
    }, 300); // 300ms debounce delay

    searchInput.addEventListener('input', handleSearch);

    // Filter handler
    statusFilter.addEventListener('change', () => {
        currentStatusFilter = statusFilter.value;
        console.log("Status filter:", currentStatusFilter);
        renderFilteredTasks();
    });

    // Function to filter and render tasks based on current state
    function renderFilteredTasks() {
        tasksList.innerHTML = ''; // Clear current list
        hide(noTasksMessage);
        hide(noFilteredTasksMessage);

        const searchTerm = currentSearchTerm;
        const status = currentStatusFilter;

        // Filter the stored tasks
        const filteredTasks = allUserTasks.filter(task => {
            const matchesStatus = status === 'all' || task.status === status;
            const matchesSearch = !searchTerm ||
                                  task.taskName.toLowerCase().includes(searchTerm) ||
                                  task.clientName.toLowerCase().includes(searchTerm);
                                  // Add more fields to search here if needed (e.g., task.email)

            return matchesStatus && matchesSearch;
        });

        console.log(`Rendering ${filteredTasks.length} filtered tasks.`);

        if (allUserTasks.length === 0) {
             show(noTasksMessage); // Show if user has no tasks at all
        } else if (filteredTasks.length === 0) {
            show(noFilteredTasksMessage); // Show if filters result in no tasks
        } else {
            filteredTasks.forEach(task => {
                renderTaskCard(task, task.id); // Pass task object and its ID
            });
        }
    }


    // --- Data Fetching and Rendering ---

    // Fetch ALL tasks for the user ONCE and store them
    async function fetchAndStoreTasks() {
        console.log(`Fetching ALL tasks from Firestore for user: ${currentUserId}`);
        allUserTasks = []; // Reset the array

        try {
            console.log("Fetching tasks. Checking db object:", db);
            if (!db) throw new Error("Firestore db object is not available.");

            const q = query(
                collection(db, 'tasks'),
                where("userId", "==", currentUserId),
                orderBy('createdAt', 'desc')
            );
            const querySnapshot = await getDocs(q);

            if (querySnapshot.empty) {
                console.log("No tasks found for this user in Firestore.");
            } else {
                 console.log(`Fetched ${querySnapshot.size} total tasks for this user.`);
                 querySnapshot.forEach((docSnap) => {
                    // Store task data along with its ID
                    allUserTasks.push({ id: docSnap.id, ...docSnap.data() });
                 });
            }
            // Initial render after fetching
            renderFilteredTasks();

        } catch (error) {
            console.error("Error fetching tasks:", error);
            tasksList.innerHTML = '<div class="text-center text-red-600 col-span-full">Error loading tasks. Please try again later.</div>';
            hide(noTasksMessage);
            hide(noFilteredTasksMessage);
        }
    }

    // Render a single task card (accepts task object with id)
    function renderTaskCard(task, taskId) {
        const card = document.createElement('div');
        card.className = 'bg-white rounded-lg shadow-md overflow-hidden cursor-pointer transition transform hover:scale-[1.03] duration-150 ease-in-out border-l-4';
        card.style.borderLeftColor = getStatusColor(task.status);

        const formattedDueDate = task.dueDate ? new Date(task.dueDate + 'T00:00:00').toLocaleDateString() : 'N/A';
        const statusClass = `status-badge-${task.status.toLowerCase().replace(/\s+/g, '-')}`;

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
        // Use the taskId passed to the function
        card.addEventListener('click', () => openTaskDetailModal(taskId));
        tasksList.appendChild(card);
    }

    // Helper to get status color
    function getStatusColor(status) { /* ... (no change) ... */ }
    function getStatusColor(status) {
        switch (status) {
            case 'Pending': return '#9ca3af';
            case 'In Progress': return '#f59e0b';
            case 'Completed': return '#10b981';
            default: return '#6b7280';
        }
    }


    // Open Task Detail Modal (fetches fresh data for the specific task)
    async function openTaskDetailModal(taskId) {
        console.log(`Opening details for task ID: ${taskId}`);
        taskDetailsContent.innerHTML = '<div class="text-center py-4"><div class="loader"></div></div>';
        openModal(taskDetailModal);

        try {
             console.log("Opening task detail. Checking db object:", db);
             if (!db) throw new Error("Firestore db object is not available.");

            const docRef = doc(db, 'tasks', taskId);
            const docSnap = await getDoc(docRef);

            if (docSnap.exists()) {
                const task = docSnap.data();
                // Check ownership before rendering details
                if (task.userId === currentUserId) {
                    renderTaskDetails(task, taskId);
                } else {
                    console.warn(`Attempted to open details for task ${taskId} which does not belong to user ${currentUserId}.`);
                    taskDetailsContent.innerHTML = '<div class="text-center text-red-600 py-4">Access Denied.</div>';
                }
            } else {
                console.log("Task not found.");
                taskDetailsContent.innerHTML = '<div class="text-center text-red-600 py-4">Task not found.</div>';
            }
        } catch (error) {
            console.error("Error fetching task details:", error);
            taskDetailsContent.innerHTML = '<div class="text-center text-red-600 py-4">Error loading details.</div>';
        }
    }

    // Render Task Details into the Modal
    function renderTaskDetails(task, taskId) { /* ... (no change) ... */ }
    function renderTaskDetails(task, taskId) {
        const formattedDueDate = task.dueDate ? new Date(task.dueDate + 'T00:00:00').toLocaleDateString() : 'N/A';
        const statusClass = `status-badge-${task.status.toLowerCase().replace(/\s+/g, '-')}`;

        let detailsHtml = 'Not provided';
        if (Array.isArray(task.taskDetails) && task.taskDetails.length > 0) {
            detailsHtml = '<ul class="list-disc list-inside pl-4 mt-1 space-y-1">';
            task.taskDetails.forEach(detail => {
                detailsHtml += `<li>${escapeHtml(detail)}</li>`;
            });
            detailsHtml += '</ul>';
        } else if (typeof task.taskDetails === 'string' && task.taskDetails) {
             detailsHtml = `<p class="mt-1">${escapeHtml(task.taskDetails)}</p>`;
        }

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
            <div class="mt-4 pt-4 border-t border-gray-200 flex justify-end">
                 <button id="editTaskBtn_${taskId}" class="px-4 py-2 text-sm font-medium text-white rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-2" style="background-color: #002147;">
                     Edit Task
                 </button>
                 </div>
        `;

        const editBtn = document.getElementById(`editTaskBtn_${taskId}`);
        if (editBtn) {
            // Pass the original task data to the edit modal opener
            editBtn.onclick = () => openEditTaskModal(task, taskId);
        }
    }


    // Open Edit Task Modal
    function openEditTaskModal(task, taskId) { /* ... (no change except check) ... */ }
    function openEditTaskModal(task, taskId) {
        // Double-check ownership before allowing edit modal to open fully
        if (task.userId !== currentUserId) {
             console.warn(`Attempted to edit task ${taskId} which does not belong to user ${currentUserId}.`);
             // Optionally show an error message to the user instead of just logging
             alert("You do not have permission to edit this task."); // Replace alert later if needed
             return;
        }

        console.log(`Opening edit modal for task ID: ${taskId}`);
        editingTaskId = taskId;
        setText(modalHeader, 'Edit Task');

        // Pre-fill form fields
        taskForm.taskName.value = task.taskName || '';
        taskForm.clientName.value = task.clientName || '';
        taskForm.contactEmail.value = task.email || '';
        taskForm.contactPhone.value = task.phone || '';
        taskForm.dueDate.value = task.dueDate || '';
        taskForm.status.value = task.status || 'Pending';

        // Pre-fill task details
        taskDetailsList.innerHTML = '';
        if (Array.isArray(task.taskDetails) && task.taskDetails.length > 0) {
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
            taskDetailsList.innerHTML = '<input type="text" class="task-detail-input" required placeholder="Detail 1">';
        }

        setText(taskError, '');
        hide(taskLoader);
        submitTaskBtn.disabled = false; // Ensure footer button is enabled

        closeModal(taskDetailModal);
        openModal(taskModal);
    }


    // Close Task Detail Modal
    closeDetailBtn.addEventListener('click', () => closeModal(taskDetailModal));

    // --- Initial Fetch ---
    if (currentUserId) {
        fetchAndStoreTasks(); // Fetch all tasks initially
    } else {
        console.error("Cannot fetch tasks, user ID is missing.");
    }

    console.log("Dashboard initialization complete.");
}
