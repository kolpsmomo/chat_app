
    

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
        let messageHistory = [];
        
        // Emoji list
        const emojis = ['😀', '😃', '😄', '😁', '😆', '😅', '😂', '🤣', '😊', '😇', '🙂', '🙃', '😉', '😍', '😘', '😗', '😙', '😚', '😋', '😜', '😝', '😛', '🤨', '😐', '😑', '🙄', '😯', '😦', '😧', '😮', '😲', '😳', '🥺', '😦', '😨', '😰', '😥', '😓', '🥶', '🥵', '🥴', '😵', '🤯', '🤠', '🥳', '😎', '🤓', '🧐', '😕', '😟', '🙁', '☹️', '😖', '😞', '😟', '😠', '😡', '🤬', '😈', '👿', '🤡', '💩', '💀', '👐', '🙌', '👏', '🙏', '🤝', '👍', '👎', '👊', '✊', '🤛', '🤜', '💪', '🤏', '👌', '🤘', '🤞', '✌️', '🖖', '🤘', '🤙', '🖐️', '✋', '👋'];
        
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
            const clientId = Date.now().toString();
            socket = new WebSocket(`ws://${window.location.host}/ws/${username}/${clientId}`);
            
            socket.onopen = () => {
                console.log('WebSocket connected');
            };
            
            socket.onmessage = (event) => {
                const messageData = JSON.parse(event.data);
                
                if (messageData.type === "delete") {
                    // Удаление сообщения
                    const messageElement = document.querySelector(`[data-message-id="${messageData.message_id}"]`);
                    if (messageElement) {
                        messageElement.remove();
                    }
                } else {
                    // Отображение сообщения
                    displayMessage(messageData);
                }
            };
            
            socket.onclose = () => {
                console.log('WebSocket disconnected, reconnecting...');
                setTimeout(() => connectWebSocket(username), 2000);
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
                
                // Время сообщения (локальное время пользователя)
                const timeElement = document.createElement('div');
                timeElement.classList.add('message-time');
                const messageDate = new Date(messageData.timestamp);
                timeElement.textContent = messageDate.toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit'
                });
                timeContainer.appendChild(timeElement);
                
                // Кнопка удаления (только для своих сообщений или админа)
                if ((isAdmin || isCurrentUser) && messageData.id) {
                    const deleteBtn = document.createElement('button');
                    deleteBtn.classList.add('delete-btn');
                    deleteBtn.innerHTML = '✕';
                    deleteBtn.title = 'Удалить сообщение';
                    deleteBtn.addEventListener('click', (e) => {
                        e.stopPropagation();
                        messageToDelete = messageData.id;
                        deleteModal.style.display = 'flex';
                    });
                    timeContainer.appendChild(deleteBtn);
                }
                
                messageElement.appendChild(timeContainer);
                chatMessages.appendChild(messageElement);
                chatMessages.scrollTop = chatMessages.scrollHeight;
            }
        }
        
        function setupEmojiPicker() {
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
                socket.send(JSON.stringify({
                    text: message
                }));
                messageInput.value = '';
                emojiPicker.style.display = 'none';
            }
        }
    });