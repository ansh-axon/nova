package com.example.data

import android.util.Log
import kotlinx.coroutines.flow.Flow
import java.util.UUID

class ChatRepository(private val chatDao: ChatDao) {

    val allUsers: Flow<List<User>> = chatDao.getAllUsers()
    val allChats: Flow<List<Chat>> = chatDao.getAllChats()
    val allCallLogs: Flow<List<CallLog>> = chatDao.getAllCallLogs()

    fun getMessagesForChat(chatId: String): Flow<List<Message>> {
        return chatDao.getMessagesForChat(chatId)
    }

    suspend fun getUserById(id: Int): User? {
        return chatDao.getUserById(id)
    }

    suspend fun insertMessage(message: Message) {
        // Save the message
        chatDao.insertMessage(message)
        
        // Automatically check/update the chat preview
        val existingChat = chatDao.getChatById(message.chatId)
        if (existingChat != null) {
            val previewText = when {
                message.mediaType != null -> {
                    val icon = when (message.mediaType) {
                        "IMAGE" -> "📸 Photo"
                        "VIDEO" -> "🎥 Video"
                        "DOCUMENT" -> "📄 Doc"
                        "AUDIO" -> "🎵 Audio"
                        else -> "📦 Media"
                    }
                    if (existingChat.isGroup) "${message.senderName}: $icon" else icon
                }
                existingChat.isGroup -> "${message.senderName}: ${message.content}"
                else -> message.content
            }
            chatDao.updateChat(
                existingChat.copy(
                    lastMessage = previewText,
                    lastMsgTimestamp = message.timestamp,
                    unreadCount = if (message.senderId != 0) existingChat.unreadCount + 1 else 0
                )
            )
        }
    }

    suspend fun insertCallLog(call: CallLog) {
        chatDao.insertCallLog(call)
    }

    suspend fun resetUnreadCount(chatId: String) {
        chatDao.getChatById(chatId)?.let { chat ->
            if (chat.unreadCount > 0) {
                chatDao.updateChat(chat.copy(unreadCount = 0))
            }
        }
    }

    // Seeding is triggered upon successful registration / login
    suspend fun seedContactsIfEmpty(myUsername: String, myEmail: String) {
        val userCount = chatDao.getUserCount()
        Log.d("ChatRepository", "Seeding database. Current user count: $userCount")
        
        // Always set/re-set current user at ID 0 to correspond to active login session
        val me = User(
            id = 0,
            username = myUsername,
            email = myEmail,
            statusText = "Available in our private 15-circle.",
            avatarColor = 0xFF00A884, // Green primary
            isOnline = true,
            securityVerificationCode = generate60DigitSecCode()
        )
        chatDao.insertUser(me)

        if (userCount <= 1) { // Only seed other users if they don't already exist
            val contacts = listOf(
                User(1, "Sneha Sharma", "sneha@privchat.com", "Busy 📚", 0xFFE91E63, true, generate60DigitSecCode()),
                User(2, "Vicky Kaushik", "vicky@privchat.com", "At the gym 💪", 0xFFFF9800, false, generate60DigitSecCode()),
                User(3, "Priya Chopra", "priya@privchat.com", "Urgent calls only 📞", 0xFF9C27B0, true, generate60DigitSecCode()),
                User(4, "Akash Verma", "akash@privchat.com", "Code is life 💻", 0xFF2196F3, true, generate60DigitSecCode()),
                User(5, "Kabir Singh", "kabir@privchat.com", "In a meeting 🔇", 0xFF607D8B, false, generate60DigitSecCode()),
                User(6, "Ananya Roy", "ananya@privchat.com", "Living, laughing, loving ✨", 0xFFFF5722, true, generate60DigitSecCode()),
                User(7, "Amit Patel", "amit@privchat.com", "Sleeping 😴", 0xFF3F51B5, false, generate60DigitSecCode()),
                User(8, "Meera Nair", "meera@privchat.com", "Hey there! I am using PrivChat", 0xFFE040FB, true, generate60DigitSecCode()),
                User(9, "Sameer Rao", "sameer@privchat.com", "Travel diaries ✈️", 0xFF00BCD4, false, generate60DigitSecCode()),
                User(10, "Divya Joshi", "divya@privchat.com", "Keep moving forward 🚀", 0xFF8BC34A, true, generate60DigitSecCode()),
                User(11, "Rohan Sen", "rohan@privchat.com", "Offline is the new luxury", 0xFF9E9E9E, false, generate60DigitSecCode()),
                User(12, "Neha Gupta", "neha@privchat.com", "Coffee & Books ☕📚", 0xFFFFC107, true, generate60DigitSecCode()),
                User(13, "Vikram Goel", "vikram@privchat.com", "Explore the world 🗺️", 0xFF00E676, false, generate60DigitSecCode()),
                User(14, "Shreya Sen", "shreya@privchat.com", "Design is thinking visual 🎨", 0xFF7C4DFF, true, generate60DigitSecCode()),
                User(100, "NOVA ChatGPT AI 🤖", "chatgpt@nova.ai", "Always secure. Type to ask anything! ⚡", 0xFF009688, true, "VERIFIED_AI")
            )
            chatDao.insertUsers(contacts)
            
            // Seed Chats
            val now = System.currentTimeMillis()
            
            // Seed Group Chat ("group_main")
            chatDao.insertChat(Chat(
                id = "group_main",
                name = "⚛️ Private Circle (15/15) ⚛️",
                lastMessage = "Ananya: Done! Group chat works flawlessly.",
                lastMsgTimestamp = now - 10 * 1000,
                isGroup = true,
                unreadCount = 2
            ))

            // Seed a few conversations
            chatDao.insertChat(Chat(
                id = "direct_1",
                name = "Sneha Sharma",
                lastMessage = "Kal college chalna hai?",
                lastMsgTimestamp = now - 3 * 60 * 1000,
                isGroup = false,
                unreadCount = 1
            ))

            chatDao.insertChat(Chat(
                id = "direct_2",
                name = "Vicky Kaushik",
                lastMessage = "Bro, call check kar. Voice line clean hai.",
                lastMsgTimestamp = now - 45 * 60 * 1000,
                isGroup = false,
                unreadCount = 0
            ))

            chatDao.insertChat(Chat(
                id = "direct_4",
                name = "Akash Verma",
                lastMessage = "📁 Document: decryption_keys.txt",
                lastMsgTimestamp = now - 2 * 3600 * 1000,
                isGroup = false,
                unreadCount = 0
            ))

            chatDao.insertChat(Chat(
                id = "chatgpt",
                name = "NOVA ChatGPT AI 🤖",
                lastMessage = "Start chatting with NOVA ChatGPT secure AI Space!",
                lastMsgTimestamp = now - 1000,
                isGroup = false,
                unreadCount = 0
            ))
            
            // Direct chat placeholders for others to ensure they can be click-opened
            for (i in listOf(3, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14)) {
                val name = when(i) {
                    3 -> "Priya Chopra"
                    5 -> "Kabir Singh"
                    6 -> "Ananya Roy"
                    7 -> "Amit Patel"
                    8 -> "Meera Nair"
                    9 -> "Sameer Rao"
                    10 -> "Divya Joshi"
                    11 -> "Rohan Sen"
                    12 -> "Neha Gupta"
                    13 -> "Vikram Goel"
                    else -> "Shreya Sen"
                }
                chatDao.insertChat(Chat(
                    id = "direct_$i",
                    name = name,
                    lastMessage = "Tap to start end-to-end encrypted chat.",
                    lastMsgTimestamp = now - (i * 24 * 3600 * 1000L),
                    isGroup = false,
                    unreadCount = 0
                ))
            }

            // Seed messages in group_main
            chatDao.insertMessage(Message(
                chatId = "group_main",
                senderId = 4,
                senderName = "Akash Verma",
                content = "Welcome everyone to our private 15-friend WhatsApp circle! Completely e2e encrypted with zero lag.",
                timestamp = now - 2 * 60 * 60 * 1000,
                status = 2
            ))
            chatDao.insertMessage(Message(
                chatId = "group_main",
                senderId = 1,
                senderName = "Sneha Sharma",
                content = "Wow this is literally WhatsApp but restricted to only 15 of us! Love the secure vibe. 🔒",
                timestamp = now - 1 * 60 * 60 * 1000,
                status = 2
            ))
            chatDao.insertMessage(Message(
                chatId = "group_main",
                senderId = 2,
                senderName = "Vicky Kaushik",
                content = "Group video call support check kiya kya?",
                timestamp = now - 30 * 60 * 1000,
                status = 2
            ))
            chatDao.insertMessage(Message(
                chatId = "group_main",
                senderId = 6,
                senderName = "Ananya Roy",
                content = "Done! Group chat works flawlessly.",
                timestamp = now - 10 * 1000,
                status = 2
            ))

            // Seed messages for direct chats
            chatDao.insertMessage(Message(
                chatId = "direct_1",
                senderId = 1,
                senderName = "Sneha Sharma",
                content = "Hi there! Kaise ho?",
                timestamp = now - 15 * 60 * 1000,
                status = 2
            ))
            chatDao.insertMessage(Message(
                chatId = "direct_1",
                senderId = 0,
                senderName = "Me",
                content = "Pristine! NOVA secure app responsive design check kar raha hu.",
                timestamp = now - 10 * 60 * 1000,
                status = 2
            ))
            chatDao.insertMessage(Message(
                chatId = "direct_1",
                senderId = 1,
                senderName = "Sneha Sharma",
                content = "Kal college chalna hai?",
                timestamp = now - 3 * 60 * 1000,
                status = 1 // delivered status
            ))

            // Vicky messages
            chatDao.insertMessage(Message(
                chatId = "direct_2",
                senderId = 2,
                senderName = "Vicky Kaushik",
                content = "Bro audio calling testing perfect hai.",
                timestamp = now - 50 * 60 * 1000,
                status = 2
            ))
            chatDao.insertMessage(Message(
                chatId = "direct_2",
                senderId = 2,
                senderName = "Vicky Kaushik",
                content = "Bro, call check kar. Voice line clean hai.",
                timestamp = now - 45 * 60 * 1000,
                status = 2
            ))

            // Akash messages (with doc)
            chatDao.insertMessage(Message(
                chatId = "direct_4",
                senderId = 4,
                senderName = "Akash Verma",
                content = "Sending you the encryption keys backup file as requested.",
                timestamp = now - 3 * 3600 * 1000,
                status = 2
            ))
            chatDao.insertMessage(Message(
                chatId = "direct_4",
                senderId = 4,
                senderName = "Akash Verma",
                content = "decryption_keys.txt",
                timestamp = now - 2 * 3600 * 1000,
                status = 2,
                mediaType = "DOCUMENT",
                mediaUrl = "decryption_keys_secured.txt",
                mediaSize = "24 KB"
            ))

            // Seed messages for NOVA ChatGPT
            chatDao.insertMessage(Message(
                chatId = "chatgpt",
                senderId = 100,
                senderName = "NOVA ChatGPT AI 🤖",
                content = "Hello! I am NOVA ChatGPT, your private AI workspace. How can I help you securely today?",
                timestamp = now - 500,
                status = 2
            ))

            // Seed Call Logs
            chatDao.insertCallLog(CallLog(
                contactId = 1,
                contactName = "Sneha Sharma",
                avatarColor = 0xFFE91E63,
                timestamp = now - 15 * 60 * 1000,
                isVideo = false,
                isIncoming = true,
                wasAnswered = true,
                durationText = "04:32"
            ))
            chatDao.insertCallLog(CallLog(
                contactId = 2,
                contactName = "Vicky Kaushik",
                avatarColor = 0xFFFF9800,
                timestamp = now - 45 * 60 * 1000,
                isVideo = true,
                isIncoming = false,
                wasAnswered = true,
                durationText = "12:14"
            ))
            chatDao.insertCallLog(CallLog(
                contactId = 3,
                contactName = "Priya Chopra",
                avatarColor = 0xFF9C27B0,
                timestamp = now - 20 * 3600 * 1000,
                isVideo = false,
                isIncoming = true,
                wasAnswered = false,
                durationText = "Missed"
            ))
        }
    }

    suspend fun createCustomContact(username: String, email: String) {
        val randomId = (15..10000).random()
        val secCode = generate60DigitSecCode()
        val user = User(
            id = randomId,
            username = username,
            email = email,
            statusText = "Available privately. Secured.",
            avatarColor = 0xFF5F5AF6,
            isOnline = true,
            securityVerificationCode = secCode
        )
        chatDao.insertUser(user)

        val chatId = "direct_$randomId"
        chatDao.insertChat(Chat(
            id = chatId,
            name = username,
            lastMessage = "Session initialized. Tap to chat secure.",
            lastMsgTimestamp = System.currentTimeMillis(),
            isGroup = false,
            unreadCount = 0
        ))
    }

    private fun generate60DigitSecCode(): String {
        val chars = "0123456789"
        return (1..60).map { chars.random() }.joinToString("")
            .chunked(5).joinToString(" ")
    }
}
