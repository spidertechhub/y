// Replace with your Supabase project details
const SUPABASE_URL = 'https://hieybtfplabbykyykcui.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhpZXlidGZwbGFiYnlreXlrY3VpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQ5OTE0NjUsImV4cCI6MjA3MDU2NzQ2NX0.CYdPNMT1ai_60nRHFbmgMgB2QVMwdxl2K8p588WLaR4';

const { createClient } = supabase;
const db = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// DOM Elements
const loginContainer = document.getElementById('login-container');
const appContainer = document.getElementById('app-container');
const loginForm = document.getElementById('login-form');
const errorMessage = document.getElementById('error-message');
const logoutButton = document.getElementById('logout-button');
const navLinks = document.querySelectorAll('.nav-link');
const pages = document.querySelectorAll('.page');
const currentUserElem = document.getElementById('current-user');
const adminPanelLink = document.getElementById('admin-panel-link');
const adminOnlyHeaders = document.querySelectorAll('.admin-only-header');

// Sales Page
const addSaleButton = document.getElementById('add-sale-button');
const exportSalesCSV = document.getElementById('export-sales-csv');
const salesTableBody = document.getElementById('sales-table-body');

// Cards Page
const addCardButton = document.getElementById('add-card-button');
const cardsTableBody = document.getElementById('cards-table-body');

// Admin Panel
const agentsTableBody = document.getElementById('agents-table-body');

// Modals
const saleModal = document.getElementById('sale-modal');
const cardModal = document.getElementById('card-modal');
const closeButtons = document.querySelectorAll('.close-button');

// Forms
const saleForm = document.getElementById('sale-form');
const cardForm = document.getElementById('card-form');

// Chat
const agentList = document.getElementById('agent-list');
const chatWithElem = document.getElementById('chat-with');
const chatMessages = document.getElementById('chat-messages');
const messageInput = document.getElementById('message-input');
const sendMessageButton = document.getElementById('send-message-button');

let currentUser;
let userRole;
let chatSubscription;
let currentChatPartner = null;

// --- AUTHENTICATION ---
async function logout() {
    if (chatSubscription) {
        await chatSubscription.unsubscribe();
        chatSubscription = null;
    }
    await db.auth.signOut();
    currentUser = null;
    userRole = null;
    appContainer.classList.add('hidden');
    loginContainer.classList.remove('hidden');
    salesTableBody.innerHTML = '';
    cardsTableBody.innerHTML = '';
    agentsTableBody.innerHTML = '';
    agentList.innerHTML = '';
}

async function checkUser() {
    const { data: { session } } = await db.auth.getSession();
    if (session) {
        currentUser = session.user;
        const { data: userProfile, error } = await db.from('users').select('role, full_name').eq('id', currentUser.id).single();
        if (userProfile) {
            userRole = userProfile.role;
            currentUserElem.textContent = userProfile.full_name || currentUser.email;
            setupUIForRole(userRole);
            showPage('dashboard');
            appContainer.classList.remove('hidden');
            loginContainer.classList.add('hidden');
            loadInitialData();
        } else {
            console.error('Error fetching user profile:', error);
            await logout();
        }
    } else {
        appContainer.classList.add('hidden');
        loginContainer.classList.remove('hidden');
    }
}

loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    errorMessage.textContent = '';
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;
    const { error } = await db.auth.signInWithPassword({ email, password });
    if (error) {
        errorMessage.textContent = error.message;
    } else {
        loginForm.reset();
        await checkUser();
    }
});

logoutButton.addEventListener('click', logout);

function setupUIForRole(role) {
    if (role === 'admin') {
        adminPanelLink.classList.remove('hidden');
        adminOnlyHeaders.forEach(h => h.classList.remove('hidden'));
    } else {
        adminPanelLink.classList.add('hidden');
        adminOnlyHeaders.forEach(h => h.classList.add('hidden'));
    }
}

// --- NAVIGATION & UI ---
navLinks.forEach(link => {
    link.addEventListener('click', (e) => {
        e.preventDefault();
        navLinks.forEach(l => l.classList.remove('active'));
        link.classList.add('active');
        showPage(link.getAttribute('data-target'));
    });
});

function showPage(pageId) {
    pages.forEach(p => p.classList.add('hidden'));
    const pageToShow = document.getElementById(pageId);
    if(pageToShow) pageToShow.classList.remove('hidden');
}

// --- DATA LOADING & SUBSCRIPTIONS ---
async function loadInitialData() {
    loadSales();
    loadCards();
    if (userRole === 'admin') loadAgents();
    loadChatUsers();
    subscribeToChanges();
}

function subscribeToChanges() {
    db.channel('public-changes')
        .on('postgres_changes', { event: '*', schema: 'public' }, payload => {
            console.log('Change received, reloading data.', payload);
            loadSales();
            loadCards();
            if (userRole === 'admin') loadAgents();
            loadChatUsers();
        }).subscribe();
}

// --- SALES MANAGEMENT --- (This section is unchanged and correct)
async function loadSales() {
    const { data, error } = await db.from('sales').select('*').order('created_at', { ascending: false });
    if (error) return console.error('Error loading sales:', error);
    salesTableBody.innerHTML = '';
    data.forEach(sale => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${sale.travel_type || ''}</td>
            <td>${sale.from_station || ''}</td>
            <td>${sale.to_station || ''}</td>
            <td>${sale.date_of_travel || ''}</td>
            <td>${sale.customer_name || ''}</td>
            <td>${(sale.passenger_names || []).join(', ')}</td>
            <td>${sale.phone_number || ''}</td>
            <td>${sale.status || ''}</td>
            ${userRole === 'admin' ? `<td class="admin-only">${sale.agent_name || ''}</td>` : ''}
            <td>${sale.cost || 0}</td>
            <td class="actions">
                <button class="edit-btn" onclick="editSale('${sale.id}')">Edit</button>
                <button class="delete-btn" onclick="deleteSale('${sale.id}')">Delete</button>
            </td>
        `;
        salesTableBody.appendChild(row);
    });
}

// --- CARD DETAILS MANAGEMENT ---

async function loadCards() {
    const { data, error } = await db.from('cards').select('*, users(full_name)').order('created_at', { ascending: false });
    if (error) {
        console.error('Error loading cards:', error);
        return;
    }
    cardsTableBody.innerHTML = '';
    data.forEach(card => {
        const row = document.createElement('tr');
        // ================== START CHANGE ==================
        // Added `<td>***</td>` to display the masked CVV
        row.innerHTML = `
            <td>${card.card_type}</td>
            <td>${card.cardholder_name}</td>
            <td>${'**** **** **** ' + String(card.card_number || '').slice(-4)}</td>
            <td>${card.expiry_date}</td>
            <td>***</td>
            ${userRole === 'admin' ? `<td>${card.users ? card.users.full_name : 'N/A'}</td>` : ''}
            <td class="actions">
                <button class="edit-btn" onclick="editCard('${card.id}')">Edit</button>
                <button class="delete-btn" onclick="deleteCard('${card.id}')">Delete</button>
            </td>
        `;
        // =================== END CHANGE ===================
        cardsTableBody.appendChild(row);
    });
}

cardForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const cardId = document.getElementById('card-id').value;
    // ================== START CHANGE ==================
    // Added `cvv` to the data object being saved
    const cardData = {
        card_type: document.getElementById('card-type').value,
        cardholder_name: document.getElementById('cardholder-name').value,
        card_number: document.getElementById('card-number').value,
        expiry_date: document.getElementById('expiry-date').value,
        cvv: document.getElementById('cvv').value, // Get CVV from form
        agent_id: currentUser.id
    };
    // =================== END CHANGE ===================

    let result;
    if (cardId) {
        result = await db.from('cards').update(cardData).eq('id', cardId);
    } else {
        result = await db.from('cards').insert([cardData]);
    }

    if (result.error) {
        alert('Error saving card: ' + result.error.message);
    } else {
        cardModal.style.display = 'none';
        loadCards(); // Refresh the list
    }
});

async function editCard(id) {
    const { data, error } = await db.from('cards').select('*').eq('id', id).single();
    if (error) {
        alert('Error fetching card data.');
        return;
    }

    document.getElementById('card-id').value = data.id;
    document.getElementById('card-type').value = data.card_type;
    document.getElementById('cardholder-name').value = data.cardholder_name;
    document.getElementById('card-number').value = data.card_number;
    document.getElementById('expiry-date').value = data.expiry_date;
    // ================== START CHANGE ==================
    // Populate the CVV field when editing
    document.getElementById('cvv').value = data.cvv;
    // =================== END CHANGE ===================
    
    document.getElementById('card-modal-title').textContent = 'Edit Card';
    cardModal.style.display = 'block';
}


// --- ADMIN PANEL ---
async function loadAgents() {
    const { data, error } = await db.from('users').select('id, full_name, role');
    if (error) {
        console.error('Error loading agents:', error);
        return;
    }
    agentsTableBody.innerHTML = '';
    data.filter(agent => agent.role === 'agent').forEach(agent => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${agent.full_name}</td>
            <td>(ID: ${agent.id.substring(0,8)}...)</td>
            <td class="actions"></td>
        `;
        agentsTableBody.appendChild(row);
    });
}

// --- (The rest of the file is for modals, chat, etc. and is unchanged) ---
addSaleButton.addEventListener('click', () => { saleForm.reset(); document.getElementById('sale-id').value = ''; document.getElementById('sale-modal-title').textContent = 'Add Sale'; saleModal.style.display = 'block'; });
saleForm.addEventListener('submit', async (e) => { e.preventDefault(); const id = document.getElementById('sale-id').value; const data = { travel_type: document.getElementById('travel-type').value, from_station: document.getElementById('from-station').value, to_station: document.getElementById('to-station').value, date_of_travel: document.getElementById('date-of-travel').value, customer_name: document.getElementById('customer-name').value, passenger_names: document.getElementById('passenger-names').value.split(',').map(s=>s.trim()), phone_number: document.getElementById('phone-number').value, status: document.getElementById('status').value, cost: document.getElementById('cost').value, agent_id: currentUser.id, agent_name: currentUserElem.textContent }; const res = id ? await db.from('sales').update(data).eq('id', id) : await db.from('sales').insert([data]); if(res.error) alert('Error: ' + res.error.message); else saleModal.style.display = 'none'; });
async function editSale(id) { const {data,error} = await db.from('sales').select('*').eq('id',id).single(); if(error) return; document.getElementById('sale-id').value = data.id; document.getElementById('travel-type').value=data.travel_type; document.getElementById('from-station').value=data.from_station; document.getElementById('to-station').value=data.to_station; document.getElementById('date-of-travel').value=data.date_of_travel; document.getElementById('customer-name').value=data.customer_name; document.getElementById('passenger-names').value=(data.passenger_names||[]).join(', '); document.getElementById('phone-number').value=data.phone_number; document.getElementById('status').value=data.status; document.getElementById('cost').value=data.cost; document.getElementById('sale-modal-title').textContent = 'Edit Sale'; saleModal.style.display = 'block'; }
async function deleteSale(id) { if (confirm('Are you sure?')) { const {error} = await db.from('sales').delete().eq('id',id); if(error) alert(error.message); } }
exportSalesCSV.addEventListener('click', async () => { const {data,error} = await db.from('sales').select('*'); if(error) return; let csv = Object.keys(data[0]).join(',')+'\n'; data.forEach(row => { csv += Object.values(row).map(v=>`"${v}"`).join(',')+'\n'; }); const a = document.createElement('a'); a.href='data:text/csv;charset=utf-8,'+encodeURI(csv); a.download='sales.csv'; a.click(); });
addCardButton.addEventListener('click', () => { cardForm.reset(); document.getElementById('card-modal-title').textContent = 'Add Card'; cardModal.style.display = 'block'; });
async function deleteCard(id) { if (confirm('Are you sure?')) { const {error} = await db.from('cards').delete().eq('id',id); if(error) alert(error.message); } }
async function loadChatUsers() { const { data, error } = await db.from('users').select('id, full_name'); if (error) return console.error('Error loading chat users:', error); agentList.innerHTML = ''; data.filter(u => u.id !== currentUser.id).forEach(user => { const li = document.createElement('li'); li.textContent = user.full_name; li.dataset.id = user.id; li.addEventListener('click', () => startChat(user)); agentList.appendChild(li); }); }
async function startChat(partner) { if(currentChatPartner?.id === partner.id) return; currentChatPartner = partner; chatWithElem.textContent = `Chat with ${partner.full_name}`; messageInput.disabled = false; sendMessageButton.disabled = false; document.querySelectorAll('#agent-list li').forEach(li => li.classList.remove('active')); document.querySelector(`#agent-list li[data-id='${partner.id}']`)?.classList.add('active'); await loadMessages(); if (chatSubscription) await chatSubscription.unsubscribe(); chatSubscription = db.channel(`chat`).on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, p => { if((p.new.sender_id===currentUser.id&&p.new.receiver_id===currentChatPartner.id)||(p.new.sender_id===currentChatPartner.id&&p.new.receiver_id===currentUser.id)) appendMessage(p.new); }).subscribe(); }
async function loadMessages() { if(!currentChatPartner) return; chatMessages.innerHTML = ''; const {data,error} = await db.from('messages').select('*').or(`(sender_id.eq.${currentUser.id},receiver_id.eq.${currentChatPartner.id}),(sender_id.eq.${currentChatPartner.id},receiver_id.eq.${currentUser.id})`).order('created_at'); if(error) return; data.forEach(appendMessage); }
function appendMessage(msg) { const div = document.createElement('div'); div.classList.add('message', msg.sender_id === currentUser.id ? 'sent' : 'received'); const p = document.createElement('p'); p.textContent=msg.message; div.appendChild(p); chatMessages.appendChild(div); chatMessages.scrollTop = chatMessages.scrollHeight; }
async function sendMessage() { const text = messageInput.value.trim(); if(!text || !currentChatPartner) return; const payload = { sender_id: currentUser.id, receiver_id: currentChatPartner.id, message: text }; const {error} = await db.from('messages').insert(payload); if(error) { alert(error.message) } else { appendMessage(payload); messageInput.value=''; } }
sendMessageButton.addEventListener('click', sendMessage);
messageInput.addEventListener('keypress', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } });
closeButtons.forEach(b => { b.addEventListener('click', (e) => e.target.closest('.modal').style.display = 'none'); });
window.onclick = (e) => { if (e.target.classList.contains('modal')) e.target.style.display = 'none'; };
document.addEventListener('DOMContentLoaded', checkUser);
