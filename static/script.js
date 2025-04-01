document.addEventListener('DOMContentLoaded', () => {
    // Элементы интерфейса
    const messageInput = document.getElementById('message-input');
    const sendButton = document.getElementById('send-button');
    const chatMessages = document.getElementById('chat-messages');
    const usernameModal = document.getElementById('username-modal');
    const usernameInput = document.getElementById('username-input');
    const submitUsername = document.getElementById('submit-username');
    const chatContainer = document.getElementById('chat-container');
    const currentUsernameSpan = document.getElementById('current-username');
    const emojiBtn = document.getElementById('emoji-btn');
    const emojiPicker = document.getElementById('emoji-picker');
    const deleteModal = document.getElementById('delete-modal');
    const confirmDeleteBtn = document.getElementById('confirm-delete');
    const cancelDeleteBtn = document.getElementById('cancel-delete');
    
    let socket;
    let username = localStorage.getItem('chat_username');
    let isAdmin = false;
    let messageToDelete = null;
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    
    // Проверка сохранённого имени
    if (username) {
        startChat(username);
    } else {
        showUsernameModal();
    }
    
    // Функции
    function showUsernameModal() {
        usernameModal.style.display = 'flex';
        chatContainer.style.display = 'none';
        
        submitUsername.addEventListener('click', () => {
            const inputUsername = usernameInput.value.trim();
            if (inputUsername) {
                username = inputUsername;
                isAdmin = username === "aspect";
                localStorage.setItem('chat_username', username);
                startChat(username);
            }
        });
        
        usernameInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                submitUsername.click();
            }
        });
    }
    
    function startChat(username) {
        usernameModal.style.display = 'none';
        chatContainer.style.display = 'flex';
        currentUsernameSpan.textContent = username;
        
        connectWebSocket(username);
        setupEmojiPicker();
        setupMessageSending();
        setupDeleteModal();
    }
    
    function connectWebSocket(username) {
        const protocol = window.location.protocol === 'https:' ? 'wss://' : 'ws://';
        const wsUrl = `${protocol}${window.location.host}/ws/${username}/${Date.now()}`;
        console.log('Connecting to WebSocket:', wsUrl); // Важно для отладки
        
        socket = new WebSocket(wsUrl);
    
        socket.onopen = () => {
            console.log('WebSocket connected successfully');
            loadMessageHistory(); // Загружаем историю после подключения
        };
    
        socket.onerror = (error) => {
            console.error('WebSocket error:', error);
        };
    
        socket.onclose = (event) => {
            console.log('WebSocket closed. Code:', event.code, 'Reason:', event.reason);
        };
    }
    
    function displayMessage(messageData) {
        const messageElement = document.createElement('div');
        messageElement.classList.add('message');
        
        if (messageData.id) {
            messageElement.dataset.messageId = messageData.id;
        }
        
        if (messageData.username === 'Система') {
            messageElement.classList.add('system');
            messageElement.textContent = messageData.text;
            chatMessages.insertBefore(messageElement, chatMessages.firstChild);
        } else {
            const isCurrentUser = messageData.username === username;
            messageElement.classList.add(isCurrentUser ? 'sent' : 'received');
            
            if (!isCurrentUser) {
                const usernameElement = document.createElement('div');
                usernameElement.classList.add('message-username');
                usernameElement.textContent = messageData.username;
                messageElement.appendChild(usernameElement);
            }
            
            const textElement = document.createElement('div');
            textElement.classList.add('message-text');
            textElement.textContent = messageData.text;
            messageElement.appendChild(textElement);
            
            // Контейнер для времени и кнопки удаления
            const timeContainer = document.createElement('div');
            timeContainer.classList.add('message-time-container');
            
            // Преобразуем время с учетом локальной зоны пользователя
            const serverDate = new Date(messageData.timestamp);
            const userDate = new Date(serverDate.getTime() - (serverDate.getTimezoneOffset() * 60000));
            
            const timeElement = document.createElement('div');
            timeElement.classList.add('message-time');
            timeElement.textContent = userDate.toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit'
            });
            timeContainer.appendChild(timeElement);
            
            if ((isAdmin || isCurrentUser) && messageData.id) {
                const deleteBtn = document.createElement('button');
                deleteBtn.classList.add('delete-btn');
                deleteBtn.innerHTML = '✕';
                deleteBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    messageToDelete = messageData.id;
                    deleteModal.style.display = 'flex';
                });
                timeContainer.appendChild(deleteBtn);
            }
            
            messageElement.appendChild(timeContainer);
            chatMessages.appendChild(messageElement);
        }
        
        if (messageData.username !== 'Система') {
            chatMessages.scrollTop = chatMessages.scrollHeight;
        }
    }
    
    function setupEmojiPicker() {
        const emojis = ['😀', '😂', '😍', '😎', '🤔', '👍', '❤️', '🔥', '🎉', '👋'];
        emojis.forEach(emoji => {
            const emojiElement = document.createElement('span');
            emojiElement.classList.add('emoji');
            emojiElement.textContent = emoji;
            emojiElement.addEventListener('click', () => {
                messageInput.value += emoji;
                messageInput.focus();
                emojiPicker.style.display = 'none';
            });
            emojiPicker.appendChild(emojiElement);
        });
        
        emojiBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            emojiPicker.style.display = emojiPicker.style.display === 'flex' ? 'none' : 'flex';
        });
        
        document.addEventListener('click', (e) => {
            if (!emojiBtn.contains(e.target) && !emojiPicker.contains(e.target)) {
                emojiPicker.style.display = 'none';
            }
        });
    }
    
    function setupDeleteModal() {
        confirmDeleteBtn.addEventListener('click', () => {
            if (messageToDelete) {
                socket.send(JSON.stringify({
                    type: "delete",
                    message_id: messageToDelete
                }));
                messageToDelete = null;
                deleteModal.style.display = 'none';
            }
        });
        
        cancelDeleteBtn.addEventListener('click', () => {
            messageToDelete = null;
            deleteModal.style.display = 'none';
        });
    }
    
    function setupMessageSending() {
        sendButton.addEventListener('click', sendMessage);
        messageInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                sendMessage();
            }
        });
    }
    
    function sendMessage() {
        const message = messageInput.value.trim();
        if (message && socket && socket.readyState === WebSocket.OPEN) {
            // Анимация отправки
            sendButton.classList.add('sending');
            setTimeout(() => sendButton.classList.remove('sending'), 500);
            
            socket.send(JSON.stringify({
                text: message
            }));
            messageInput.value = '';
            emojiPicker.style.display = 'none';
        }
    }
});