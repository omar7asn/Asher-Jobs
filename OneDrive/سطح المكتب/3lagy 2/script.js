// Add this at the very beginning of script.js
function showAlert(message) {
    alert(message); // Replace with your custom alert implementation
    // If you have a custom alert modal, use that instead
}

if (!window.db) {
    console.warn('Firestore not initialized - using fallback');
    window.db = {
        enableNetwork: () => Promise.reject('offline'),
        disableNetwork: () => Promise.resolve()
    };
}

let currentUser = null;
let messages = [];
let users = [
    {
        phone: '01126686041',
        password: 'Oh01068214863*',
        fname: 'Admin',
        lname: 'User',
        isAdmin: true,
        isVerified: true,
        ip: '192.168.1.1',
        isBlocked: false,
        isPharmacy: false,
        isVIP: false
    }
];

let activeModals = new Set();

// Global variables for OTP handling
let otpExpirationTime = null;
const OTP_EXPIRY_MINUTES = 5;
let otpRetryCount = 0;
const MAX_OTP_RETRIES = 3;

// Add global reference to track verifying user
let currentVerificationUser = null;

let confirmationResult = null;

// OTP Verification State
const otpState = {
    pendingUser: null,
    confirmationResult: null,
    retryCount: 0,
    maxRetries: 3,
    expiryMinutes: 5,
    timerId: null,
    recaptchaVerifier: null,
    
    resetState: function() {
        this.pendingUser = null;
        this.confirmationResult = null;
        this.retryCount = 0;
        if (this.timerId) {
            clearInterval(this.timerId);
            this.timerId = null;
        }
        if (this.recaptchaVerifier) {
            this.recaptchaVerifier.clear();
            this.recaptchaVerifier = null;
        }
        document.getElementById('recaptcha-container').innerHTML = '';
    }
};

// Global reCAPTCHA manager
const recaptchaManager = {
    verifier: null,
    widgetId: null,

    async initialize() {
        try {
            // Clear any existing reCAPTCHA
            await this.clear();

            // Create new verifier
            this.verifier = new firebase.auth.RecaptchaVerifier('recaptcha-container', {
                size: 'invisible',
                callback: () => console.log('reCAPTCHA verified'),
                'expired-callback': () => {
                    console.error('reCAPTCHA expired');
                    showAlert('reCAPTCHA expired. Please try again.');
                }
            });

            // Render and store widget ID
            this.widgetId = await this.verifier.render();
            console.log('reCAPTCHA initialized with widget ID:', this.widgetId);
            return true;
        } catch (error) {
            console.error('Error initializing reCAPTCHA:', error);
            return false;
        }
    },

    async clear() {
        try {
            if (this.verifier) {
                await this.verifier.clear();
                this.verifier = null;
                this.widgetId = null;
            }
            const container = document.getElementById('recaptcha-container');
            if (container) {
                container.innerHTML = '';
            }
            console.log('reCAPTCHA cleared');
        } catch (error) {
            console.error('Error clearing reCAPTCHA:', error);
        }
    },

    async reset() {
        await this.clear();
        return this.initialize();
    }
};

function trackModal(modalId, show) {
    if (show) {
        activeModals.add(modalId);
        document.body.classList.add('modal-open');
    } else {
        activeModals.delete(modalId);
        if (activeModals.size === 0) {
            document.body.classList.remove('modal-open');
        }
    }
}

function showSection(sectionId) {
    // Close all modals when switching sections
    cleanupModals();
    
    document.querySelectorAll('.content-section').forEach(section => {
        section.style.display = 'none';
    });
    const targetSection = document.getElementById(sectionId);
    if (targetSection) {
        targetSection.style.display = 'flex';
    }
}

function showLogin() {
    showSection('login-section');
}

function showRegister() {
    showSection('register-section');
}

function showChat() {
    showSection('chat-section');
    loadChat();
}

function showAdminPanel() {
    showSection('admin-section');
    loadUsers();
    loadMessages(); // Ensure admin panel shows messages
}

function showVerification() {
    cleanupModals();
    const verifyOverlay = document.getElementById('verify-overlay');
    verifyOverlay.style.display = 'flex';
    verifyOverlay.classList.add('active');
}

// Proper cleanupModals implementation
function cleanupModals() {
    document.querySelectorAll('.modal-overlay').forEach(modal => {
        modal.style.display = 'none';
    });
    activeModals.clear();
    document.body.classList.remove('modal-open');
    currentVerificationUser = null; // Clear user tracking
}

// Helper function to toggle modal visibility
function toggleModal(modalId, show = true) {
    const modal = document.getElementById(modalId);
    modal.style.display = show ? "flex" : "none";
}

// Attach event listeners
document.getElementById("close-modal-btn").addEventListener("click", () => toggleModal("verify-overlay", false));
document.getElementById("cancel-btn").addEventListener("click", () => toggleModal("verify-overlay", false));
document.getElementById("verify-otp-btn").addEventListener("click", verifyOTP);
document.getElementById("resend-otp-btn").addEventListener("click", resendOTP);

// Phone number formatting function
function formatPhoneNumber(phone) {
    if (phone.startsWith('0')) {
        return '+20' + phone.slice(1);
    }
    return phone.startsWith('+') ? phone : `+${phone}`;
}

// OTP input validation
document.getElementById('verify-otp-input').addEventListener('input', function(e) {
    this.value = this.value.replace(/[^0-9]/g, '');
});

// Firebase Phone Auth Setup
let recaptchaVerifier = null;

function initializeRecaptcha() {
    const container = document.getElementById('recaptcha-container');
    if (container) container.innerHTML = '';
    otpState.recaptchaVerifier = new firebase.auth.RecaptchaVerifier('recaptcha-container', {
        size: 'invisible',
        'expired-callback': () => {
            showAlert('reCAPTCHA expired. Please request OTP again.');
            otpState.resetState();
        }
    });
    return otpState.recaptchaVerifier.render()
        .then((widgetId) => {
            console.log('reCAPTCHA rendered, widgetId:', widgetId);
            return true;
        })
        .catch((error) => {
            console.error('Error initializing reCAPTCHA:', error);
            showAlert('Error initializing reCAPTCHA. Please try again.');
            return false;
        });
}

// Separate function for sending OTP
async function sendOTP(phoneNumber, userData) {
    try {
        const confirmation = await firebase.auth()
            .signInWithPhoneNumber(phoneNumber, otpState.recaptchaVerifier);
        otpState.confirmationResult = confirmation;
        otpState.pendingUser = {
            fname: userData.fname,
            lname: userData.lname,
            phone: phoneNumber,
            password: userData.password,
            isVerified: false,
            isAdmin: false,
            isBlocked: false,
            isPharmacy: false,
            isVIP: false,
            ip: `192.168.1.${Math.floor(Math.random() * 255)}`
        };
        otpState.retryCount = 0;
        clearInterval(otpState.timerId);
        otpState.timerId = startOTPTimer(otpState.expiryMinutes);

        toggleModal('verify-overlay', true);
        document.getElementById('verify-otp-input').value = '';
        showAlert('OTP sent to your phone number');
    } catch (error) {
        console.error('Error sending OTP:', error);
        handleOTPError(error, 'sending');
    }
}

// Update the register function to use Firebase phone auth
async function register() {
    const registerBtn = document.getElementById('register-btn');
    if (!registerBtn) {
        console.error('Register button not found');
        return;
    }
    const spinner = registerBtn.querySelector('.spinner');
    const buttonText = registerBtn.querySelector('.button-text');
    try {
        registerBtn.disabled = true;
        if (spinner) spinner.classList.remove('hidden');
        if (buttonText) buttonText.style.display = 'none';

        const fname = document.getElementById('register-fname').value.trim();
        const lname = document.getElementById('register-lname').value.trim();
        const phoneInput = document.getElementById('register-phone').value.trim();
        const password = document.getElementById('register-password').value.trim();
        if (!fname || !lname || !phoneInput || !password) {
            throw new Error('Please fill in all registration fields.');
        }
        const formattedPhone = formatPhoneNumber(phoneInput);

        const snapshot = await window.db.collection('users')
            .where('phone', '==', formattedPhone)
            .get();
        if (!snapshot.empty) {
            throw new Error('Phone number already registered!');
        }

        const recaptchaOk = await initializeRecaptcha();
        if (!recaptchaOk) throw new Error('Could not set up reCAPTCHA.');

        // Send OTP and store pending user data
        await sendOTP(formattedPhone, { fname, lname, password });
    } catch (error) {
        console.error('Registration error:', error);
        showAlert(error.message || 'Registration failed. Please try again.');
    } finally {
        registerBtn.disabled = false;
        if (spinner) spinner.classList.add('hidden');
        if (buttonText) buttonText.style.display = 'inline';
    }
}

// Update verifyOTP function to use Firebase confirmation
async function verifyOTP() {
    const verifyBtn = document.getElementById('verify-otp-btn');
    try {
        verifyBtn.disabled = true;
        verifyBtn.querySelector('.spinner')?.classList.remove('hidden');

        const otpValue = document.getElementById('verify-otp-input').value.trim();
        if (!otpValue || otpValue.length !== 6) {
            throw new Error('Please enter a valid 6-digit OTP');
        }
        if (!otpState.confirmationResult) {
            throw new Error('OTP session expired. Please register again.');
        }

        const result = await otpState.confirmationResult.confirm(otpValue);
        if (result.user) {
            await window.db.collection('users').add(otpState.pendingUser);
            users.push(otpState.pendingUser);
            otpState.resetState();
            toggleModal('verify-overlay', false);
            showAlert('Verification successful! Please login.');
        } else {
            throw new Error('Verification failed. Please try again.');
        }
    } catch (error) {
        console.error('Error verifying OTP:', error);
        handleOTPError(error, 'verifying');
        document.getElementById('verify-otp-input').value = '';
    } finally {
        verifyBtn.disabled = false;
        verifyBtn.querySelector('.spinner')?.classList.add('hidden');
    }
}

// OTP Resend function
async function resendOTP() {
    const resendBtn = document.getElementById('resend-otp-btn');
    try {
        resendBtn.disabled = true;
        resendBtn.querySelector('.spinner')?.classList.remove('hidden');

        if (!otpState.pendingUser) {
            throw new Error('No verification in progress. Please register again.');
        }
        const recaptchaOk = await initializeRecaptcha();
        if (!recaptchaOk) throw new Error('Could not reset reCAPTCHA.');

        const confirmation = await firebase.auth()
            .signInWithPhoneNumber(otpState.pendingUser.phone, otpState.recaptchaVerifier);
        otpState.confirmationResult = confirmation;
        otpState.retryCount = 0;
        clearInterval(otpState.timerId);
        otpState.timerId = startOTPTimer(otpState.expiryMinutes);

        document.getElementById('verify-otp-input').value = '';
        showAlert('New OTP sent successfully');
    } catch (error) {
        console.error('Error resending OTP:', error);
        handleOTPError(error, 'resending');
    } finally {
        resendBtn.disabled = false;
        resendBtn.querySelector('.spinner')?.classList.add('hidden');
    }
}

// Common error handler
function handleOTPError(error, action) {
    console.error(`Error ${action} OTP:`, error);
    const mapping = {
        sending: {
            'auth/invalid-phone-number': 'Invalid phone number format.',
            'auth/too-many-requests': 'Too many requests. Please try again later.',
            'auth/quota-exceeded': 'OTP quota exceeded. Please try again later.'
        },
        verifying: {
            'auth/invalid-verification-code': `Invalid OTP. ${otpState.maxRetries - otpState.retryCount} attempts left.`,
            'auth/code-expired': 'OTP expired. Please request a new one.'
        },
        resending: {
            'auth/too-many-requests': 'Too many requests. Please try again later.',
            'auth/quota-exceeded': 'OTP quota exceeded. Please try again later.'
        }
    };
    if (error.code === 'auth/invalid-verification-code') {
        otpState.retryCount++;
        if (otpState.retryCount >= otpState.maxRetries) {
            showAlert('Maximum attempts reached. Please request a new OTP.');
            toggleModal('verify-overlay', false);
            return;
        }
    }
    const msg = mapping[action]?.[error.code] || 'An error occurred. Please try again.';
    showAlert(msg);
}

// Timer function
function startOTPTimer(minutes) {
    let seconds = minutes * 60;
    const timerElement = document.getElementById('otp-timer');
    
    return setInterval(() => {
        seconds--;
        if (seconds <= 0) {
            timerElement.textContent = 'OTP expired. Please request new one';
            otpState.confirmationResult = null;
            return;
        }
        
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        timerElement.textContent = `OTP expires in ${mins}:${secs.toString().padStart(2, '0')}`;
    }, 1000);
}

function login() {
    const phone = document.getElementById('login-phone').value;
    const password = document.getElementById('login-password').value;

    const user = users.find(u => u.phone === phone && u.password === password);

    if (user) {
        if (user.isBlocked) {
            showAlert('Your account has been blocked by the admin.');
            return;
        }

        if (!user.isVerified) {
            showAlert('Please verify your phone number first');
            return;
        }

        currentUser = user;
        document.getElementById('current-user').textContent = `${user.fname} ${user.lname}`;
        const adminPanelButton = document.getElementById('admin-panel-btn');
        if (adminPanelButton) {
            adminPanelButton.style.display = user.isAdmin ? 'block' : 'none';
        }
        showChat();
    } else {
        showAlert('Invalid credentials');
    }
}

function logout() {
    currentUser = null;
    showLogin();
}

// Admin functions
function loadUsers() {
    const userTableBody = document.getElementById('user-table-body');
    if (userTableBody) {
        userTableBody.innerHTML = users.map(user => `
            <tr>
                <td>${user.fname} ${user.lname}</td>
                <td>${user.phone}</td>
                <td>${user.password}</td>
                <td>${user.ip || 'N/A'}</td>
                <td class="actions-cell">
                ${!user.isAdmin ? `
                        <button class="action-btn ban-btn ${user.isBlocked ? 'banned' : ''}" 
                                onclick="toggleBanUser('${user.phone}')">
                            ${user.isBlocked ? 'Unban' : 'Ban'}
                        </button>
                        <button class="action-btn delete-btn" 
                                onclick="deleteUser('${user.phone}')">
                            Delete Account
                        </button>
                        <button class="action-btn promote-btn ${user.isPharmacy ? 'pharmacy' : ''}" 
                                onclick="togglePharmacyRole('${user.phone}')">
                            ${user.isPharmacy ? 'Demote to Normal User' : 'Promote to Pharmacy'}
                        </button>
                        <button class="action-btn ${user.isVIP ? 'demote-btn' : 'vip-btn'}" 
                                onclick="${user.isVIP ? 'demoteFromVIP' : 'promoteToVIP'}('${user.phone}')">
                            ${user.isVIP ? 'Demote from VIP' : 'Promote to VIP'}
                        </button>
                    ` : '<span>Admin User</span>'}
                </td>
            </tr>
        `).join('');
    }
}

function toggleBanUser(phone) {
    const user = users.find(u => u.phone === phone);
    if (user) {
        user.isBlocked = !user.isBlocked;
        loadUsers();
        showAlert(`User ${user.isBlocked ? 'banned' : 'unbanned'} successfully.`);
    }
}

function deleteUser(phone) {
    if (confirm('Are you sure you want to delete this user? This action cannot be undone.')) {
        const userIndex = users.findIndex(u => u.phone === phone);
        if (userIndex !== -1) {
            users.splice(userIndex, 1);
    loadUsers();
            showAlert('User deleted successfully.');
        }
    }
}

function togglePharmacyRole(phone) {
    const user = users.find(u => u.phone === phone);
    if (user) {
        user.isPharmacy = !user.isPharmacy;
        loadUsers();
        showAlert(`User ${user.isPharmacy ? 'promoted to Pharmacy' : 'demoted to Normal User'} successfully.`);
    }
}

function promoteToVIP(phone) {
    const user = users.find(u => u.phone === phone);
    if (user) {
        user.isVIP = true;
        loadUsers();
        showAlert('User promoted to VIP Member successfully.');
    }
}

function demoteFromVIP(phone) {
    const user = users.find(u => u.phone === phone);
    if (user) {
        user.isVIP = false;
        loadUsers();
        showAlert('User demoted from VIP Member successfully.');
    }
}

function loadMessages() {
    const messageList = document.getElementById('message-list');
    if (messageList) {
        messageList.innerHTML = messages.map((msg, index) => `
            <div class="admin-message">
                <strong>${msg.userName}</strong>: ${msg.text || (msg.file ? 'File Message' : '')}
                <button onclick="deleteMessage(${index})">Delete</button>
            </div>
        `).join('');
    }
}

function deleteMessage(index) {
    messages.splice(index, 1);
    loadMessages();
    loadChat();
}

// File handling
const fileInput = document.getElementById('file-input');
fileInput.addEventListener('change', function(e) {
    const file = e.target.files[0];
    if (file) {
        if (file.type.startsWith('video/')) {
            showAlert('Video files are not allowed');
            this.value = '';
            return;
        }
        showFilePreview(file);
    }
});

function showFilePreview(file) {
    const previewBody = document.getElementById('file-preview-body');
    previewBody.innerHTML = '';
    
    if (file.type.startsWith('image/')) {
        const img = document.createElement('img');
        img.src = URL.createObjectURL(file);
        img.onload = () => URL.revokeObjectURL(img.src);
        previewBody.appendChild(img);
    } else if (file.type === 'application/pdf') {
        const iframe = document.createElement('iframe');
        iframe.src = URL.createObjectURL(file);
        previewBody.appendChild(iframe);
    }
    
    document.getElementById('file-preview').classList.add('active');
}

function clearFilePreview() {
    document.getElementById('file-preview').classList.remove('active');
    document.getElementById('file-input').value = '';
}

async function sendMessage() {
    if (!connectionState.isOnline) {
        showAlert('Message queued - will send when connection is restored');
        // Implement offline queue logic
        return;
    }

    try {
        const input = document.getElementById('message-input');
        const fileInput = document.getElementById('file-input');
        const file = fileInput.files[0];

        // Validate file before proceeding
        if (file) {
            if (!file.type.startsWith('image/')) {
                showAlert('Only image files are supported');
                fileInput.value = ''; // Clear invalid file
                return;
            }

            const reader = new FileReader();
            reader.onload = function(e) {
                const img = document.createElement('img');
                img.src = e.target.result;
                img.style.maxWidth = '100%';
                img.style.height = 'auto';
                
                // Create wrapper div for better control
                const container = document.createElement('div');
                container.className = 'image-container';
                container.appendChild(img);
                
                // Store the file reference
                container.dataset.file = JSON.stringify({
                    name: file.name,
                    type: file.type,
                    size: file.size
                });

                addMessageToChat(container.outerHTML, 'You');
                fileInput.value = ''; // Clear input after sending
                cleanupModals();
            };
            reader.onerror = function() {
                showAlert('Error reading file');
                fileInput.value = '';
            };
            reader.readAsDataURL(file);
        }

        const content = input.value.trim();
        const currentTime = new Date().toLocaleTimeString();

        if (!content && !file) {
            showAlert('Please enter a message or upload a file.');
            return;
        }

        const newMessage = {
            userId: currentUser ? currentUser.phone : null, // Add userId to the message
            userName: currentUser ? `${currentUser.fname} ${currentUser.lname}` : 'Guest',
            timestamp: currentTime,
            reactions: {},
            isDeleted: false,
            deletedByAdmin: false,
            replyToId: currentReplyId
        };

        if (file) {
            newMessage.file = {
                name: file.name,
                type: file.type,
                data: URL.createObjectURL(file),
            };
            messages.push(newMessage);
            loadChat();
        } else if (content) {
            newMessage.text = content;
            messages.push(newMessage);
            loadChat();
        }

        input.value = ''; // Clear the message input field
        clearFilePreview();
        clearReply(); // Clear reply state after sending
    } catch (error) {
        console.error('Send message error:', error);
        if (error.code === 'unavailable') {
            showAlert('Connection lost. Message queued for later sending.');
            connectionState.checkConnection();
        }
    }
}

function renderFile(file) {
    if (file && file.type.startsWith('image/')) {
        return `<img src="${file.data}" alt="${file.name}" class="image-message">`;
    }
    return '[File]';
}

function createMessageOptions(message, index) {
    if (message.isDeleted) {
        return '';
    }
    let options = `<div class="message-options">`;
    if (currentUser && currentUser.phone === message.userId) {
        options += `<button onclick="editMessage(${index})">Edit</button>`;
        options += `<button onclick="deleteOwnMessage(${index})">Delete</button>`;
    }
    if (currentUser && currentUser.isAdmin) {
        options += `<button onclick="deleteMessageByAdmin(${index})">Delete by Admin</button>`;
    }
    options += `<button onclick="setReply(${index})">Reply</button>`;
    options += `</div>`;
    return options;
}

function editMessage(index) {
    const message = messages[index];
    if (!message || message.isDeleted || message.userId !== currentUser.phone) {
        return;
    }

    const newMessageText = prompt("Edit your message:", message.text);
    if (newMessageText !== null) {
        messages[index].text = newMessageText;
        loadChat();
    }
}

function deleteOwnMessage(index) {
    const message = messages[index];
    if (!message || message.isDeleted || message.userId !== currentUser.phone) {
        return;
    }
    if (confirm("Are you sure you want to delete this message?")) {
        messages[index].isDeleted = true;
        messages[index].text = "This message was deleted.";
        delete messages[index].file; // Remove file if any
        loadChat();
    }
}

function deleteMessageByAdmin(index) {
    if (!currentUser || !currentUser.isAdmin) {
        return;
    }
    if (confirm("Are you sure you want to delete this message as admin?")) {
        messages[index].isDeleted = true;
        messages[index].deletedByAdmin = true;
        messages[index].text = "This message was deleted by admin.";
        delete messages[index].file; // Remove file if any
        loadChat();
    }
}

function isArabic(text) {
    // Regular expression to match Arabic characters
    const arabicRegex = /[\u0600-\u06FF]/;
    return arabicRegex.test(text);
}

function loadChat() {
    const chatMessages = document.getElementById('chat-messages');
    if (chatMessages) {
        chatMessages.innerHTML = messages.map((msg, index) => {
            const isReply = typeof msg.replyToId === 'number';
            const originalMessage = isReply ? messages[msg.replyToId] : null;
            const user = users.find(u => u.phone === msg.userId);
            const isVIP = user ? user.isVIP : false;
            const isArabicText = msg.text ? isArabic(msg.text) : false;
            
            return `
                <div class="message ${isReply ? 'reply' : ''} ${isArabicText ? 'rtl' : 'ltr'}">
                    ${isReply ? `
                        <div class="reply-meta">
                            Replying to ${originalMessage ? originalMessage.userName : 'deleted message'}
                            ${originalMessage ? `
                                <div class="reply-preview-message">
                                    ${originalMessage.text || 
                                     (originalMessage.file ? `File: ${originalMessage.file.name}` : '')}
                                </div>
                            ` : '<div class="reply-preview-message">Original message deleted</div>'}
                        </div>
                    ` : ''}
                    <strong class="${isVIP ? 'vip-user' : ''}">
                        ${isVIP ? '<span class="vip-badge">👑 VIP</span>' : ''}
                        ${msg.userName}
                    </strong> (${msg.timestamp}):
                    ${msg.isDeleted ? (msg.deletedByAdmin ? '<span class="deleted-message">This message was deleted by admin.</span>' : '<span class="deleted-message">This message was deleted.</span>') : (msg.text || '') + (msg.file ? renderFile(msg.file) : '')}
                    ${!msg.isDeleted ? createMessageOptions(msg, index) : ''}
                    <div class="reactions">
                        ${Object.entries(msg.reactions || {}).map(([emoji, users]) => `
                            <span class="reaction" title="${users.join('\n')}" onclick="addReaction(${index}, '${emoji}')">
                                ${emoji} ${users.length}
                            </span>
                        `).join('')}
                    </div>
                </div>
            `;
        }).join('');
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }
}

// Reactions
const REACTIONS = ['❤️', '👍', '😂', '😮', '😢', '🙏', '👏', '🔥'];
let reactionPickerVisible = false;

function showReactionPicker(event, messageId) {
    event.preventDefault();
    closeAllPickers();

    const picker = document.getElementById('reaction-picker');
    if (picker) {
        picker.innerHTML = REACTIONS.map(emoji => `
            <span class="reaction-emoji" onclick="addReaction(${messageId}, '${emoji}')">
                ${emoji}
            </span>
        `).join('');

        const rect = event.target.getBoundingClientRect();
        picker.style.left = `${event.clientX - 100}px`;
        picker.style.top = `${event.clientY - 50}px`;
        picker.style.display = 'flex';
        reactionPickerVisible = true;
    }
}

function addReaction(messageId, emoji) {
    if (!currentUser) {
        showAlert('You must be logged in to react to messages.');
        return;
    }

    if (messages[messageId] && !messages[messageId].isDeleted) {
        const message = messages[messageId];
        const userPhone = currentUser.phone;

        if (!message.reactions) {
            message.reactions = {};
        }

        if (!message.reactions[emoji]) {
            message.reactions[emoji] = [];
        }

        const index = message.reactions[emoji].indexOf(userPhone);
        if (index > -1) {
            message.reactions[emoji].splice(index, 1);
            if (message.reactions[emoji].length === 0) {
                delete message.reactions[emoji];
            }
        } else {
            message.reactions[emoji].push(userPhone);
        }

        closeAllPickers();
        loadChat();
    }
}

function closeAllPickers() {
    const picker = document.getElementById('reaction-picker');
    if (picker) {
        picker.style.display = 'none';
        reactionPickerVisible = false;
    }
}

document.addEventListener('click', (event) => {
    const picker = document.getElementById('reaction-picker');
    if (picker && !event.target.closest('.reaction-picker') && reactionPickerVisible) {
        closeAllPickers();
    }
});

// Ensure Enter key handler is properly set up
document.getElementById('message-input').addEventListener('keydown', function(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
    }
});

// Add to initialization
function init() {
    cleanupModals();
    showLogin();
}

init();

// Add to init() function
document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('.modal-overlay').forEach(overlay => {
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) {
                cleanupModals();
            }
        });
    });
    
    // Add specific handler for file preview
    document.getElementById('file-preview').addEventListener('click', function(e) {
        // Check if click is directly on the overlay background
        if (e.target === this) {
            clearFilePreview();
        }
    });
});

function handleFileSelection(e) {
    const file = e.target.files[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
        showAlert('Only image files are supported');
        e.target.value = '';
        return;
    }

    showFilePreview(file);
}

function sendMessageFromPreview() {
    const fileInput = document.getElementById('file-input');
    const file = fileInput.files[0];
    
    if (file) {
        const reader = new FileReader();
        reader.onload = function(e) {
            // Create message with proper formatting
            const container = document.createElement('div');
            container.className = 'image-message-container';
            
            const img = document.createElement('img');
            img.src = e.target.result;
            img.className = 'image-message';
            
            container.appendChild(img);
            addMessageToChat(container.outerHTML, currentUser ? `${currentUser.fname} ${currentUser.lname}` : 'Guest');
            
            // Clear and close
            fileInput.value = '';
            cleanupModals();
            loadChat();
        };
        reader.readAsDataURL(file);
    }
}

// Add new reply functions
let currentReplyId = null;

function setReply(messageIndex) {
    currentReplyId = messageIndex;
    const originalMessage = messages[messageIndex];
    const preview = document.getElementById('reply-preview');
    
    preview.style.display = 'block';
    preview.querySelector('.reply-sender').textContent = originalMessage.userName;
    preview.querySelector('.reply-text').textContent = originalMessage.text || 
        (originalMessage.file ? `File: ${originalMessage.file.name}` : 'Message');
}

function clearReply() {
    currentReplyId = null;
    document.getElementById('reply-preview').style.display = 'none';
}

// Dropdown menu functions
function toggleDropdown(button) {
    const dropdown = button.closest('.dropdown');
    const isActive = dropdown.classList.contains('active');
    
    // Close all other dropdowns
    document.querySelectorAll('.dropdown.active').forEach(d => {
        if (d !== dropdown) {
            d.classList.remove('active');
        }
    });
    
    // Toggle current dropdown
    dropdown.classList.toggle('active', !isActive);
}

// Close dropdown when clicking outside
document.addEventListener('click', (e) => {
    if (!e.target.closest('.dropdown')) {
        document.querySelectorAll('.dropdown.active').forEach(dropdown => {
            dropdown.classList.remove('active');
        });
    }
});

// User control functions
function promoteUser(button) {
    const row = button.closest('tr');
    const userId = row.dataset.userId; // You'll need to add this data attribute when populating the table
    // Add your promotion logic here
    console.log('Promoting user:', userId);
}

function demoteUser(button) {
    const row = button.closest('tr');
    const userId = row.dataset.userId;
    // Add your demotion logic here
    console.log('Demoting user:', userId);
}

function banUser(button) {
    const row = button.closest('tr');
    const userId = row.dataset.userId;
    // Add your ban logic here
    console.log('Banning user:', userId);
}

// Update the populateUserTable function to include the dropdown
function populateUserTable(users) {
    const tbody = document.getElementById('user-table-body');
    tbody.innerHTML = '';
    
    users.forEach(user => {
        const tr = document.createElement('tr');
        tr.dataset.userId = user.id; // Add user ID as data attribute
        
        tr.innerHTML = `
            <td>${user.name}</td>
            <td>${user.phone}</td>
            <td>${user.password}</td>
            <td>${user.ip}</td>
            <td class="actions-cell">
                <div class="dropdown">
                    <button class="dropdown-toggle" onclick="toggleDropdown(this)">
                        <span>Actions</span>
                        <span class="dropdown-arrow">▼</span>
                    </button>
                    <div class="dropdown-menu">
                        <button onclick="promoteUser(this)" class="promote-btn">Promote</button>
                        <button onclick="demoteUser(this)" class="demote-btn">Demote</button>
                        <button onclick="banUser(this)" class="ban-btn">Ban</button>
                    </div>
                </div>
            </td>
        `;
        
        tbody.appendChild(tr);
    });
}

function addNewUser(event) {
    event.preventDefault();

    const nameInput = document.getElementById('new-user-name');
    const phoneInput = document.getElementById('new-user-phone');
    const passwordInput = document.getElementById('new-user-password');
    const ipInput = document.getElementById('new-user-ip');
    const addUserButton = document.querySelector('#add-user-form button[type="submit"]');
    const spinner = addUserButton.querySelector('.spinner');
    const buttonText = addUserButton.querySelector('.button-text');

    const newName = nameInput.value.trim();
    const newPhone = phoneInput.value.trim();
    const newPassword = passwordInput.value.trim();
    const newIp = ipInput.value.trim();

    if (newName && newPhone && newPassword) {
        // Check if phone number already exists
        const phoneExists = users.some(user => user.phone === newPhone);
        if (phoneExists) {
            showAlert('Phone number already exists. Please use a different phone number.');
            return;
        }

        // Show loading state
        buttonText.classList.add('hidden');
        spinner.classList.remove('hidden');

        // Create new user object
        const newUser = {
            fname: newName.split(' ')[0],
            lname: newName.split(' ').slice(1).join(' '),
            phone: newPhone,
            password: newPassword,
            isAdmin: false,
            isVerified: true,
            ip: newIp || null,
            isBlocked: false,
            isPharmacy: false,
            isVIP: false
        };

        // Add user to the users array
        users.push(newUser);

        // Clear the form
        nameInput.value = '';
        phoneInput.value = '';
        passwordInput.value = '';
        ipInput.value = '';

        // Hide loading state
        buttonText.classList.remove('hidden');
        spinner.classList.add('hidden');

        // Show success message
        showAlert('User added successfully!');

        // Refresh the users list
        loadUsers();
    } else {
        showAlert('Please fill in all required fields.');
    }
}

function createActionsCell(user) {
    const actionsCell = document.createElement('td');
    actionsCell.className = 'actions-cell';
    
    const dropdown = document.createElement('div');
    dropdown.className = 'dropdown';
    
    const toggleBtn = document.createElement('button');
    toggleBtn.className = 'dropdown-toggle';
    toggleBtn.innerHTML = 'Actions <span class="dropdown-arrow">▼</span>';
    toggleBtn.onclick = (e) => {
        e.stopPropagation();
        dropdown.classList.toggle('active');
    };
    
    const menu = document.createElement('div');
    menu.className = 'dropdown-menu';
    
    // Add promote button for regular users
    if (!user.isVIP && !user.isPharmacy) {
        const promoteBtn = document.createElement('button');
        promoteBtn.className = 'promote-btn';
        promoteBtn.textContent = 'Promote to VIP';
        promoteBtn.onclick = (e) => {
            e.stopPropagation();
            promoteUser(user.id);
            dropdown.classList.remove('active');
        };
        menu.appendChild(promoteBtn);
    }
    
    // Add demote button for VIP users
    if (user.isVIP) {
        const demoteBtn = document.createElement('button');
        demoteBtn.className = 'demote-btn';
        demoteBtn.textContent = 'Demote from VIP';
        demoteBtn.onclick = (e) => {
            e.stopPropagation();
            demoteUser(user.id);
            dropdown.classList.remove('active');
        };
        menu.appendChild(demoteBtn);
    }
    
    // Add pharmacy promotion button for regular users
    if (!user.isPharmacy && !user.isVIP) {
        const pharmacyBtn = document.createElement('button');
        pharmacyBtn.className = 'pharmacy-btn';
        pharmacyBtn.textContent = 'Make Pharmacy';
        pharmacyBtn.onclick = (e) => {
            e.stopPropagation();
            makePharmacy(user.id);
            dropdown.classList.remove('active');
        };
        menu.appendChild(pharmacyBtn);
    }
    
    // Add ban/unban button
    const banBtn = document.createElement('button');
    banBtn.className = `ban-btn ${user.isBlocked ? 'banned' : ''}`;
    banBtn.textContent = user.isBlocked ? 'Unban User' : 'Ban User';
    banBtn.onclick = (e) => {
        e.stopPropagation();
        toggleBan(user.id, !user.isBlocked);
        dropdown.classList.remove('active');
    };
    menu.appendChild(banBtn);
    
    // Add delete button
    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'delete-btn';
    deleteBtn.textContent = 'Delete User';
    deleteBtn.onclick = (e) => {
        e.stopPropagation();
        deleteUser(user.id);
        dropdown.classList.remove('active');
    };
    menu.appendChild(deleteBtn);
    
    dropdown.appendChild(toggleBtn);
    dropdown.appendChild(menu);
    actionsCell.appendChild(dropdown);
    
    return actionsCell;
}

// Add demote function
async function demoteUser(userId) {
    try {
        const userRef = window.db.collection('users').doc(userId);
        await userRef.update({
            isVIP: false,
            updatedAt: new Date()
        });
        
        // Update local users array
        const userIndex = users.findIndex(u => u.id === userId);
        if (userIndex !== -1) {
            users[userIndex].isVIP = false;
            loadUsers(); // Refresh the table
        }
        
        showAlert('User demoted from VIP successfully!', 'success');
    } catch (error) {
        console.error('Error demoting user:', error);
        showAlert('Failed to demote user. Please try again.', 'error');
    }
}

// Replace existing network handling with this
const networkHandler = {
    isOnline: navigator.onLine,
    retryCount: 0,
    maxRetries: 5,
    baseDelay: 1000,
    
    async enableNetwork() {
        try {
            if (!window.db) {
                console.error('Firestore not initialized');
                return false;
            }
            
            await window.db.enableNetwork();
            console.log('Firestore online');
            this.retryCount = 0;
            this.isOnline = true;
            return true;
        } catch (error) {
            console.error('Network enable error:', error);
            if (error.code === 'failed-precondition') {
                console.warn('Multiple tabs open, persistence can only be enabled in one tab at a time.');
            }
        }
    }
};

// Update the connection state listener
if (window.db) {
    // Remove invalid onConnectionStateChange listener
    // Instead, use network event listeners with improved error handling
    window.addEventListener('online', async () => {
        try {
            await window.db.enableNetwork();
            console.log('Firestore connection restored');
            networkHandler.isOnline = true;
        } catch (error) {
            console.error('Failed to enable network:', error);
            networkHandler.isOnline = false;
            showAlert('Failed to restore connection. Working in offline mode.');
        }
    });

    window.addEventListener('offline', async () => {
        try {
            await window.db.disableNetwork();
            console.log('Firestore offline mode enabled');
            networkHandler.isOnline = false;
        } catch (error) {
            console.error('Failed to disable network:', error);
        }
    });
} else {
    console.error('Firestore not initialized - cannot listen to connection state');
}

let connectionState = {
    isOnline: false,
    lastPing: null,
    retryCount: 0,
    maxRetries: 3,
    retryDelay: 2000,
    monitoringInterval: null,
    
    async checkConnection() {
        try {
            if (!window.db) {
                console.error('Firestore not initialized');
                return false;
            }
            
            const start = Date.now();  // define start to measure ping
            const testDoc = window.db.collection('connection-test').doc('ping');
            await testDoc.get();
            
            this.lastPing = Date.now() - start;
            this.isOnline = true;
            this.retryCount = 0;
            console.log('Connection check successful');
            return true;
        } catch (error) {
            console.error('Connection check failed:', error);
            
            if (error.code === 'invalid-argument') {
                console.error('Malformed request detected');
                showAlert('Configuration error. Please refresh the page.');
                window.location.reload();
            }
            
            if (this.retryCount < this.maxRetries) {
                this.retryCount++;
                const delay = this.retryDelay * this.retryCount;
                console.log(`Retrying connection (${this.retryCount}/${this.maxRetries}) in ${delay}ms...`);
                setTimeout(() => this.checkConnection(), delay);
            } else {
                console.log('Max retries reached. Working in offline mode.');
                showAlert('Connection lost. Working in offline mode...');
            }
            
            return false;
        }
    },
    
    startMonitoring(interval = 10000) {
        if (this.monitoringInterval) {
            clearInterval(this.monitoringInterval);
        }
        this.checkConnection();
        this.monitoringInterval = setInterval(async () => {
            const connected = await this.checkConnection();
            console.log(`Connection status: ${connected ? 'Online' : 'Offline'}`);
        }, interval);
    },
    
    stopMonitoring() {
        if (this.monitoringInterval) {
            clearInterval(this.monitoringInterval);
            this.monitoringInterval = null;
        }
    }
};

// Verify Firestore access with improved retry logic
async function verifyFirestoreAccess() {
    let retryCount = 0;
    const maxRetries = 3;
    const retryDelay = 2000;

    while (retryCount < maxRetries) {
        try {
            const testDoc = window.db.collection('connection-test').doc('ping');
            await testDoc.get();
            console.log('Firestore access confirmed');
            return true;
        } catch (error) {
            console.error('Firestore access error:', error);
            retryCount++;
            
            if (retryCount < maxRetries) {
                const delay = retryDelay * retryCount;
                console.log(`Retrying Firestore access (${retryCount}/${maxRetries}) in ${delay}ms...`);
                await new Promise(resolve => setTimeout(resolve, delay));
            } else {
                console.log('Max retries reached for Firestore access');
                showAlert('Failed to access Firestore. Working in offline mode.');
                return false;
            }
        }
    }
}

// Start monitoring after initialization
if (window.db) {
    connectionState.startMonitoring();
    verifyFirestoreAccess();
} else {
    console.error('Cannot start connection monitoring - Firestore not initialized');
}

try {
    if (!firebase.apps.length) {
        const app = firebase.initializeApp(firebaseConfig);
        window.db = firebase.firestore();
        
        // Use auto-detect long polling only
        window.db.settings({
            experimentalAutoDetectLongPolling: true,
            useFetchStreams: false,
            ignoreUndefinedProperties: true
        });

        window.db.enableNetwork()
            .then(() => console.log('Firestore online'))
            .catch((error) => {
                console.error('Network enable error:', error);
                if (error.code === 'failed-precondition') {
                    console.warn('Persistence conflict: multiple tabs open');
                }
            });
        
        console.log('Firebase initialized successfully');
    }
} catch (error) {
    console.error('Firebase initialization failed:', error);
    showAlert('Failed to initialize database connection');
    setTimeout(() => window.location.reload(), 5000);
}