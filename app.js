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
/**
 * Shows an HTML element by removing the 'hidden' class and adding 'flex' or 'block'.
 * @param {HTMLElement} el - The element to show.
 * @param {string} displayType - 'flex' or 'block', defaults to 'flex' for modals.
 */
function show(el, displayType = 'flex') {
    if (el) {
        el.classList.remove('hidden');
        if (displayType === 'flex') el.classList.add('flex');
        else if (displayType === 'block') el.classList.add('block');
        else el.style.display = displayType; // Fallback for other display types
        // For modals with opacity transition
        if (el.classList.contains('modal')) {
            setTimeout(() => el.classList.remove('opacity-0'), 10);
        }
    }
}

/**
 * Hides an HTML element by adding the 'hidden' class and removing 'flex' or 'block'.
 * @param {HTMLElement} el - The element to hide.
 */
function hide(el) {
    if (el) {
        // For modals with opacity transition
        if (el.classList.contains('modal')) {
            el.classList.add('opacity-0');
            setTimeout(() => {
                el.classList.add('hidden');
                el.classList.remove('flex', 'block'); // Remove display classes
            }, 250); // Match transition duration
        } else {
            el.classList.add('hidden');
            el.classList.remove('flex', 'block');
        }
    }
}


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
 * @param {string | number | null | undefined} unsafe - The potentially unsafe string.
 * @returns {string} The escaped string, or empty string if input is null/undefined.
 */
function escapeHtml(unsafe) {
    if (unsafe === null || typeof unsafe === 'undefined') return '';
    if (typeof unsafe !== 'string') unsafe = String(unsafe);
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
    const loginForm = document.getElementById('loginForm');
    const loginBtn = document.getElementById('loginBtn');
    const loginError = document.getElementById('loginError');
    const loginLoader = document.getElementById('loginLoader');

    if (loginForm) {
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            hide(loginError); 
            setText(loginError, '');
            show(loginLoader, 'block'); 
            if (loginBtn) loginBtn.disabled = true;

            const email = loginForm.email.value.trim();
            const password = loginForm.password.value;

            try {
                console.log(`Attempting login for: ${email}`);
                await signInWithEmailAndPassword(auth, email, password);
                console.log("Login successful.");
            } catch (err) {
                console.error("Login failed:", err);
                let message = 'Login failed. Please check your email and password.';
                if (err.code === 'auth/user-not-found' || err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential') {
                    message = 'Invalid email or password.';
                } else if (err.code === 'auth/invalid-email') {
                    message = 'Please enter a valid email address.';
                }
                setText(loginError, message);
                show(loginError, 'block'); 
                hide(loginLoader); 
                if (loginBtn) loginBtn.disabled = false;
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
    if (!currentUser || !currentUser.uid) {
        console.error("Dashboard initialization called without a valid user. Aborting.");
        window.location.replace('login.html');
        return;
    }
    const currentUserId = currentUser.uid;
    console.log(`Initializing dashboard elements and listeners for user: ${currentUserId}`);

    // Get references to all necessary DOM elements
    const logoutBtn = document.getElementById('logoutBtn');
    const tasksList = document.getElementById('tasksList');
    const noTasksMessage = document.getElementById('noTasksMessage');
    const noFilteredTasksMessage = document.getElementById('noFilteredTasksMessage');
    const addTaskBtnNav = document.getElementById('addTaskBtnNav');
    const addTaskBtnFab = document.getElementById('addTaskBtnFab');
    const taskModal = document.getElementById('taskModal');
    const taskForm = document.getElementById('taskForm');
    const cancelTaskBtn = document.getElementById('cancelTaskBtn');
    const submitTaskBtn = document.getElementById('submitTaskBtn');
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

    // Invoice Generation Elements
    const generateInvoiceBtnNav = document.getElementById('generateInvoiceBtnNav');
    const generateInvoiceBtnFab = document.getElementById('generateInvoiceBtnFab');
    const clientSelectionModal = document.getElementById('clientSelectionModal');
    const clientSelectionForm = document.getElementById('clientSelectionForm');
    const invoiceClientSelect = document.getElementById('invoiceClientSelect');
    const clientSelectionError = document.getElementById('clientSelectionError');
    const cancelClientSelectBtn = document.getElementById('cancelClientSelectBtn');
    const nextToInvoiceFormBtn = document.getElementById('nextToInvoiceFormBtn');

    const invoiceFormModal = document.getElementById('invoiceFormModal');
    const invoiceClientNameDisplay = document.getElementById('invoiceClientNameDisplay');
    const invoiceItemService = document.getElementById('invoiceItemService');
    const invoiceItemDescription = document.getElementById('invoiceItemDescription');
    const invoiceItemQty = document.getElementById('invoiceItemQty');
    const invoiceItemPrice = document.getElementById('invoiceItemPrice');
    const addInvoiceItemBtn = document.getElementById('addInvoiceItemBtn');
    const invoiceItemsList = document.getElementById('invoiceItemsList');
    const invoiceSubtotalDisplay = document.getElementById('invoiceSubtotalDisplay');
    const invoiceGrandTotalDisplay = document.getElementById('invoiceGrandTotalDisplay');
    const invoiceFormError = document.getElementById('invoiceFormError');
    const cancelInvoiceFormBtn = document.getElementById('cancelInvoiceFormBtn');
    const downloadInvoicePdfBtn = document.getElementById('downloadInvoicePdfBtn');
    const closeInvoiceFormBtn = document.getElementById('closeInvoiceFormBtn'); 


    // State variables
    let editingTaskId = null;
    let allUserTasks = [];
    let currentSearchTerm = '';
    let currentStatusFilter = 'all';
    let currentInvoiceItems = []; 
    let selectedInvoiceClient = null; 
    const CURRENCY_SYMBOL = "GMD"; 

    // --- Check if essential elements exist ---
    if (!logoutBtn || !tasksList || !addTaskBtnNav || !addTaskBtnFab || !taskModal || !taskForm || !taskDetailModal || !welcomeMessageEl || !searchInput || !statusFilter ||
        !generateInvoiceBtnNav || !generateInvoiceBtnFab || !clientSelectionModal || !invoiceFormModal || !closeInvoiceFormBtn) { 
        console.error("One or more dashboard elements could not be found. Aborting initialization.");
        return;
    }

    // --- Initial Setup ---
    setText(welcomeMessageEl, `Welcome, ${escapeHtml(currentUser.email)}!`);

    // --- Event Listeners ---

    logoutBtn.addEventListener('click', async () => {
        try {
            await signOut(auth);
            console.log("User signed out.");
            window.dashboardInitialized = false;
        } catch (error) {
            console.error("Error signing out:", error);
        }
    });

    function openModal(modalElement) {
        show(modalElement); 
    }
    function closeModal(modalElement) {
        hide(modalElement);
    }

    const openAddTaskModal = () => {
        editingTaskId = null;
        setText(modalHeader, 'Add New Task');
        clearInputs(taskForm);
        setText(taskError, '');
        hide(taskLoader);
        submitTaskBtn.disabled = false;
        taskDetailsList.innerHTML = '<input type="text" class="task-detail-input" required placeholder="Detail 1">';
        openModal(taskModal);
    };

    addTaskBtnNav.addEventListener('click', openAddTaskModal);
    addTaskBtnFab.addEventListener('click', openAddTaskModal);
    cancelTaskBtn.addEventListener('click', () => closeModal(taskModal));

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

    submitTaskBtn.addEventListener('click', () => {
        if (taskForm.checkValidity()) { 
            taskForm.requestSubmit();
        } else {
            taskForm.reportValidity(); 
            setText(taskError, 'Please fill all required fields correctly.');
            show(taskError, 'block');
        }
    });

    taskForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        hide(taskError);
        setText(taskError, '');
        show(taskLoader, 'block');
        submitTaskBtn.disabled = true;

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
            await fetchAndStoreTasks();
            renderFilteredTasks();
        } catch (err) {
            console.error("Error saving task:", err);
            setText(taskError, `Failed to save task: ${err.message}`);
            show(taskError, 'block');
        } finally {
            hide(taskLoader);
            submitTaskBtn.disabled = false;
            editingTaskId = null;
        }
    });


    // --- Search and Filter Logic ---
    const handleSearch = debounce(() => {
        currentSearchTerm = searchInput.value.toLowerCase().trim();
        renderFilteredTasks();
    }, 300);
    searchInput.addEventListener('input', handleSearch);

    statusFilter.addEventListener('change', () => {
        currentStatusFilter = statusFilter.value;
        renderFilteredTasks();
    });

    function renderFilteredTasks() {
        tasksList.innerHTML = '';
        hide(noTasksMessage);
        hide(noFilteredTasksMessage);

        const searchTerm = currentSearchTerm;
        const status = currentStatusFilter;

        const filteredTasks = allUserTasks.filter(task => {
            const matchesStatus = status === 'all' || task.status === status;
            const matchesSearch = !searchTerm ||
                                  task.taskName.toLowerCase().includes(searchTerm) ||
                                  task.clientName.toLowerCase().includes(searchTerm);
            return matchesStatus && matchesSearch;
        });

        if (allUserTasks.length === 0) {
             show(noTasksMessage, 'block');
        } else if (filteredTasks.length === 0) {
            show(noFilteredTasksMessage, 'block');
        } else {
            filteredTasks.forEach(task => {
                renderTaskCard(task, task.id);
            });
        }
    }


    // --- Data Fetching and Rendering ---
    async function fetchAndStoreTasks() {
        allUserTasks = [];
        try {
            if (!db) throw new Error("Firestore db object is not available.");
            const q = query(
                collection(db, 'tasks'),
                where("userId", "==", currentUserId),
                orderBy('createdAt', 'desc')
            );
            const querySnapshot = await getDocs(q);
            querySnapshot.forEach((docSnap) => {
                allUserTasks.push({ id: docSnap.id, ...docSnap.data() });
            });
            renderFilteredTasks();
        } catch (error) {
            console.error("Error fetching tasks:", error);
            tasksList.innerHTML = '<div class="text-center text-red-600 col-span-full">Error loading tasks. Please try again later.</div>';
            hide(noTasksMessage);
            hide(noFilteredTasksMessage);
        }
    }

    function renderTaskCard(task, taskId) {
        const card = document.createElement('div');
        card.className = 'bg-white rounded-lg shadow-md overflow-hidden cursor-pointer transition transform hover:scale-[1.03] duration-150 ease-in-out border-l-4';
        card.style.borderLeftColor = getStatusColor(task.status);

        const formattedDueDate = task.dueDate ? new Date(task.dueDate + 'T00:00:00').toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : 'N/A';
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
        card.addEventListener('click', () => openTaskDetailModal(taskId));
        tasksList.appendChild(card);
    }

    function getStatusColor(status) {
        switch (status) {
            case 'Pending': return '#9ca3af';
            case 'In Progress': return '#f59e0b';
            case 'Completed': return '#10b981';
            default: return '#6b7280';
        }
    }

    async function openTaskDetailModal(taskId) {
        taskDetailsContent.innerHTML = '<div class="text-center py-4"><div class="loader"></div></div>';
        const existingDeleteBtn = taskDetailModal.querySelector('#deleteTaskBtn');
        const existingEditBtn = taskDetailModal.querySelector('#editTaskBtn');
        if (existingDeleteBtn) existingDeleteBtn.onclick = null;
        if (existingEditBtn) existingEditBtn.onclick = null;

        openModal(taskDetailModal);

        try {
             if (!db) throw new Error("Firestore db object is not available.");
            const docRef = doc(db, 'tasks', taskId);
            const docSnap = await getDoc(docRef);

            if (docSnap.exists()) {
                const task = docSnap.data();
                if (task.userId === currentUserId) {
                    renderTaskDetails(task, taskId);
                } else {
                    taskDetailsContent.innerHTML = '<div class="text-center text-red-600 py-4">Access Denied.</div>';
                     const deleteBtn = taskDetailModal.querySelector('#deleteTaskBtn');
                     const editBtn = taskDetailModal.querySelector('#editTaskBtn');
                     if(deleteBtn) hide(deleteBtn);
                     if(editBtn) hide(editBtn);
                }
            } else {
                taskDetailsContent.innerHTML = '<div class="text-center text-red-600 py-4">Task not found.</div>';
            }
        } catch (error) {
            console.error("Error fetching task details:", error);
            taskDetailsContent.innerHTML = '<div class="text-center text-red-600 py-4">Error loading details.</div>';
        }
    }

    function renderTaskDetails(task, taskId) {
        const formattedDueDate = task.dueDate ? new Date(task.dueDate + 'T00:00:00').toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : 'N/A';
        const statusClass = `status-badge-${task.status.toLowerCase().replace(/\s+/g, '-')}`;

        let detailsHtml = '<p class="text-gray-500"><em>Not provided</em></p>';
        if (Array.isArray(task.taskDetails) && task.taskDetails.length > 0) {
            detailsHtml = '<ul class="list-disc list-inside pl-1 mt-1 space-y-1">';
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
        `;

        const editBtn = taskDetailModal.querySelector('#editTaskBtn');
        const deleteBtn = taskDetailModal.querySelector('#deleteTaskBtn');

        if (editBtn) {
            show(editBtn, 'inline-block');
            editBtn.onclick = () => openEditTaskModal(task, taskId);
        }
        if (deleteBtn) {
            show(deleteBtn, 'inline-block');
            deleteBtn.onclick = () => deleteTask(taskId);
        }
    }

    async function deleteTask(taskId) {
        if (!window.confirm("Are you sure you want to delete this task? This action cannot be undone.")) {
            return;
        }
        try {
            if (!db) throw new Error("Firestore db object is not available.");
            const docRef = doc(db, 'tasks', taskId);
            await deleteDoc(docRef);
            closeModal(taskDetailModal);
            allUserTasks = allUserTasks.filter(task => task.id !== taskId);
            renderFilteredTasks();
        } catch (error) {
            console.error("Error deleting task:", error);
            alert(`Failed to delete task: ${error.message}`); 
        }
    }

    function openEditTaskModal(task, taskId) {
        if (task.userId !== currentUserId) {
             alert("You do not have permission to edit this task.");
             return;
        }
        editingTaskId = taskId;
        setText(modalHeader, 'Edit Task');
        taskForm.taskName.value = task.taskName || '';
        taskForm.clientName.value = task.clientName || '';
        taskForm.contactEmail.value = task.email || '';
        taskForm.contactPhone.value = task.phone || '';
        taskForm.dueDate.value = task.dueDate || '';
        taskForm.status.value = task.status || 'Pending';

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
        submitTaskBtn.disabled = false;
        closeModal(taskDetailModal);
        openModal(taskModal);
    }

    closeDetailBtn.addEventListener('click', () => closeModal(taskDetailModal));


    // --- INVOICE GENERATION LOGIC ---
    const openClientSelectionModal = () => {
        invoiceClientSelect.innerHTML = '<option value="">-- Select a Client --</option>'; 
        setText(clientSelectionError, '');
        nextToInvoiceFormBtn.disabled = true;

        if (allUserTasks.length === 0) {
            setText(clientSelectionError, 'No tasks found to derive client list.');
            openModal(clientSelectionModal);
            return;
        }

        const clientNames = [...new Set(allUserTasks.map(task => task.clientName.trim()).filter(name => name))]
                            .sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));

        if (clientNames.length === 0) {
            setText(clientSelectionError, 'No unique clients found in tasks.');
        } else {
            clientNames.forEach(name => {
                const option = document.createElement('option');
                option.value = escapeHtml(name);
                option.textContent = escapeHtml(name);
                invoiceClientSelect.appendChild(option);
            });
        }
        openModal(clientSelectionModal);
    };

    if (generateInvoiceBtnNav) generateInvoiceBtnNav.addEventListener('click', openClientSelectionModal);
    if (generateInvoiceBtnFab) generateInvoiceBtnFab.addEventListener('click', openClientSelectionModal);


    invoiceClientSelect.addEventListener('change', () => {
        if (invoiceClientSelect.value) {
            nextToInvoiceFormBtn.disabled = false;
            setText(clientSelectionError, '');
        } else {
            nextToInvoiceFormBtn.disabled = true;
        }
    });

    cancelClientSelectBtn.addEventListener('click', () => closeModal(clientSelectionModal));

    nextToInvoiceFormBtn.addEventListener('click', () => {
        selectedInvoiceClient = invoiceClientSelect.value;
        if (!selectedInvoiceClient) {
            setText(clientSelectionError, 'Please select a client.');
            return;
        }
        closeModal(clientSelectionModal);
        setText(invoiceClientNameDisplay, escapeHtml(selectedInvoiceClient));
        
        currentInvoiceItems = [];
        renderInvoiceItems(); 
        updateInvoiceTotals();
        invoiceItemService.value = '';
        invoiceItemDescription.value = '';
        invoiceItemQty.value = '1'; // Default Qty to 1
        invoiceItemPrice.value = ''; // Default Price to empty
        setText(invoiceFormError, '');
        openModal(invoiceFormModal);
        invoiceItemService.focus();
    });

    function renderInvoiceItems() {
        invoiceItemsList.innerHTML = '';
        if (currentInvoiceItems.length === 0) {
            invoiceItemsList.innerHTML = '<p class="text-sm text-gray-500 text-center p-4">No items added yet.</p>';
            downloadInvoicePdfBtn.disabled = true;
            return;
        }

        const table = document.createElement('table');
        table.className = 'w-full text-sm';
        const thead = document.createElement('thead');
        thead.innerHTML = `
            <tr class="border-b bg-slate-50 text-left">
                <th class="py-2 px-3 font-semibold text-gray-600">Service/Item</th>
                <th class="py-2 px-3 font-semibold text-gray-600 text-right">Qty x Price</th>
                <th class="py-2 px-3 font-semibold text-gray-600 text-right">Total</th>
                <th class="py-2 px-1 w-10 font-semibold text-gray-600 text-center"></th>
            </tr>
        `;
        table.appendChild(thead);

        const tbody = document.createElement('tbody');
        currentInvoiceItems.forEach((item, index) => {
            const tr = document.createElement('tr');
            tr.className = 'border-b last:border-b-0 hover:bg-slate-50 transition-colors duration-150';
            tr.innerHTML = `
                <td class="py-2.5 px-3">
                    <div class="font-medium text-gray-700">${escapeHtml(item.service)}</div>
                    ${item.description ? `<div class="text-xs text-gray-500">${escapeHtml(item.description)}</div>` : ''}
                </td>
                <td class="py-2.5 px-3 text-right text-gray-600">${item.qty} x ${CURRENCY_SYMBOL} ${parseFloat(item.price).toFixed(2)}</td>
                <td class="py-2.5 px-3 text-right font-medium text-gray-700">${CURRENCY_SYMBOL} ${parseFloat(item.lineTotal).toFixed(2)}</td>
                <td class="py-2.5 px-1 text-center">
                    <button type="button" class="text-red-500 hover:text-red-700 removeItemBtn p-1 rounded-full hover:bg-red-100 transition-colors" data-index="${index}" title="Remove Item">
                        <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                </td>
            `;
            tbody.appendChild(tr);
        });
        table.appendChild(tbody);
        invoiceItemsList.appendChild(table);
        downloadInvoicePdfBtn.disabled = false;

        invoiceItemsList.querySelectorAll('.removeItemBtn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const indexToRemove = parseInt(e.target.closest('button').dataset.index);
                currentInvoiceItems.splice(indexToRemove, 1);
                renderInvoiceItems();
                updateInvoiceTotals();
            });
        });
    }

    function updateInvoiceTotals() {
        const subtotal = currentInvoiceItems.reduce((sum, item) => sum + item.lineTotal, 0);
        const grandTotal = subtotal; 

        setText(invoiceSubtotalDisplay, `${CURRENCY_SYMBOL} ${subtotal.toFixed(2)}`);
        setText(invoiceGrandTotalDisplay, `${CURRENCY_SYMBOL} ${grandTotal.toFixed(2)}`);
    }

    addInvoiceItemBtn.addEventListener('click', () => {
        const service = invoiceItemService.value.trim();
        const description = invoiceItemDescription.value.trim();
        // Qty and Price are now integers due to step="1" in HTML
        const qty = parseInt(invoiceItemQty.value); 
        const price = parseInt(invoiceItemPrice.value);

        setText(invoiceFormError, '');
        if (!service) {
            setText(invoiceFormError, 'Service/Product name is required.');
            invoiceItemService.focus();
            return;
        }
        if (isNaN(qty) || qty <= 0) {
            setText(invoiceFormError, 'Quantity must be a positive whole number.');
            invoiceItemQty.focus();
            return;
        }
        if (isNaN(price) || price < 0) { 
            setText(invoiceFormError, 'Price must be a non-negative whole number.');
            invoiceItemPrice.focus();
            return;
        }

        currentInvoiceItems.push({
            service,
            description,
            qty,
            price,
            lineTotal: qty * price
        });

        renderInvoiceItems();
        updateInvoiceTotals();

        invoiceItemService.value = '';
        invoiceItemDescription.value = '';
        invoiceItemQty.value = '1'; // Reset Qty to 1
        invoiceItemPrice.value = ''; // Reset Price to empty
        invoiceItemService.focus();
    });
    
    const resetAndCloseInvoiceModal = () => {
        closeModal(invoiceFormModal);
        currentInvoiceItems = [];
        selectedInvoiceClient = null;
        invoiceClientSelect.value = ''; 
        setText(invoiceFormError, '');
    };

    cancelInvoiceFormBtn.addEventListener('click', resetAndCloseInvoiceModal);
    closeInvoiceFormBtn.addEventListener('click', resetAndCloseInvoiceModal);


    downloadInvoicePdfBtn.addEventListener('click', () => {
        if (currentInvoiceItems.length === 0) {
            setText(invoiceFormError, 'Cannot generate PDF. No items in invoice.');
            show(invoiceFormError, 'block');
            return;
        }
        setText(invoiceFormError, '');


        const { jsPDF } = window.jspdf;
        const doc = new jsPDF();

        doc.setProperties({
            title: `Invoice for ${selectedInvoiceClient}`,
            subject: 'Service Invoice',
            author: 'LexoTasks Manager',
        });

        const yourCompany = { 
            name: currentUser.displayName || "Bepro Visualz", 
            cityStateZip: "Banjul, The Gambia", 
            phone: "(+220) 3735360",
            email: currentUser.email || "infot@ybeprovisualz.com"
        };

        doc.setFontSize(22);
        doc.setFont(undefined, 'bold');
        doc.text("INVOICE", 105, 22, { align: 'center' });
        doc.setFont(undefined, 'normal');

        let startY = 35;
        doc.setFontSize(10);
        doc.text(yourCompany.name, 20, startY);
        doc.text(yourCompany.address, 20, startY + 5);
        doc.text(yourCompany.cityStateZip, 20, startY + 10);
        doc.text(`P: ${yourCompany.phone}`, 20, startY + 15);
        doc.text(`E: ${yourCompany.email}`, 20, startY + 20);

        doc.setFontSize(11);
        doc.setFont(undefined, 'bold');
        doc.text("BILL TO:", 130, startY);
        doc.setFont(undefined, 'normal');
        doc.setFontSize(10);
        doc.text(selectedInvoiceClient, 130, startY + 5);
        
        const clientTask = allUserTasks.find(task => task.clientName === selectedInvoiceClient);
        if (clientTask && clientTask.email) {
             doc.text(clientTask.email, 130, startY + 10);
        }
         if (clientTask && clientTask.phone) {
             doc.text(clientTask.phone, 130, startY + 15);
        }


        const today = new Date();
        const invoiceDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
        const invoiceNumber = `INV-${Date.now().toString().slice(-6)}`;
        const tempDueDate = new Date(); 
        tempDueDate.setDate(today.getDate() + 30);
        const dueDate = tempDueDate.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });


        startY = startY + 10; 
        doc.setFontSize(10);
        doc.text(`Invoice #:`, 130, startY + 20); 
        doc.setFont(undefined, 'bold');
        doc.text(invoiceNumber, 155, startY + 20);
        doc.setFont(undefined, 'normal');

        doc.text(`Date:`, 130, startY + 25);
        doc.setFont(undefined, 'bold');
        doc.text(invoiceDate, 155, startY + 25);
        doc.setFont(undefined, 'normal');
        
        doc.text(`Due Date:`, 130, startY + 30);
        doc.setFont(undefined, 'bold');
        doc.text(dueDate, 155, startY + 30);
        doc.setFont(undefined, 'normal');


        const tableColumn = ["#", "Service/Product", "Description", "Qty", `Unit Price (${CURRENCY_SYMBOL})`, `Total (${CURRENCY_SYMBOL})`];
        const tableRows = [];

        currentInvoiceItems.forEach((item, index) => {
            const itemData = [
                index + 1,
                item.service,
                item.description || '-', 
                item.qty, // Qty is now an integer
                parseFloat(item.price).toFixed(2), // Price is an integer, display with .00
                parseFloat(item.lineTotal).toFixed(2) // Total, display with .00
            ];
            tableRows.push(itemData);
        });

        doc.autoTable({
            startY: startY + 40, 
            head: [tableColumn],
            body: tableRows,
            theme: 'striped', 
            headStyles: { fillColor: [0, 33, 71] }, 
            styles: { fontSize: 9, cellPadding: 1.8, valign: 'middle' },
            columnStyles: {
                0: { cellWidth: 10, halign: 'center' }, 
                1: { cellWidth: 'auto' }, 
                2: { cellWidth: 'auto' }, 
                3: { cellWidth: 15, halign: 'right' }, 
                4: { cellWidth: 25, halign: 'right' }, 
                5: { cellWidth: 25, halign: 'right' }  
            },
            didDrawPage: function (data) { 
                let pageCount = doc.internal.getNumberOfPages();
                doc.setFontSize(8);
                doc.text('Page ' + doc.internal.getCurrentPageInfo().pageNumber + ' of ' + pageCount, data.settings.margin.left, doc.internal.pageSize.height - 10);
            }
        });

        let finalY = doc.autoTable.previous.finalY;
        if (!finalY) { 
            finalY = startY + 40 + (currentInvoiceItems.length * 10) + 20; 
        }
        finalY += 10; 

        if (finalY > 250) { 
             doc.addPage();
             finalY = 20;
        }

        const subtotal = currentInvoiceItems.reduce((sum, item) => sum + item.lineTotal, 0);
        const grandTotal = subtotal; 

        doc.setFontSize(10);
        doc.text(`Subtotal:`, 140, finalY, {align: 'left'});
        doc.text(`${CURRENCY_SYMBOL} ${subtotal.toFixed(2)}`, 195, finalY, {align: 'right'});

        finalY += 7;
        doc.setFontSize(12);
        doc.setFont(undefined, 'bold');
        doc.text(`TOTAL:`, 140, finalY, {align: 'left'});
        doc.text(`${CURRENCY_SYMBOL} ${grandTotal.toFixed(2)}`, 195, finalY, {align: 'right'});
        doc.setFont(undefined, 'normal');

        finalY += 15;
         if (finalY > 260) { doc.addPage(); finalY = 20; }
        doc.setFontSize(9);
        doc.text("Notes:", 20, finalY);
        doc.text("Thank you for your business! Please make payments to GT Bank 2042681011590 0r WAVE 3735360.", 20, finalY + 5, { maxWidth: 175 });


        doc.save(`Invoice-${invoiceNumber}-${selectedInvoiceClient.replace(/[^a-z0-9]/gi, '_')}.pdf`);
    });


    // --- Initial Data Fetch ---
    if (currentUserId) {
        fetchAndStoreTasks();
    } else {
        console.error("Cannot fetch tasks, user ID is missing.");
    }

    console.log("Dashboard initialization complete.");
} // End of initializeDashboard function
