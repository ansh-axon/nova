package com.example.ui

import android.app.Application
import android.content.Context
import android.util.Log
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.example.api.GeminiHelper
import com.example.data.*
import kotlinx.coroutines.Delay
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.*
import kotlinx.coroutines.launch
import java.text.SimpleDateFormat
import java.util.*
import okhttp3.MediaType.Companion.toMediaTypeOrNull

enum class CallState {
    NONE, RINGING, CONNECTED, DISCONNECTED, INCOMING
}

@OptIn(kotlinx.coroutines.ExperimentalCoroutinesApi::class)
class ChatViewModel(application: Application) : AndroidViewModel(application) {

    private val db = AppDatabase.getDatabase(application)
    private val repository = ChatRepository(db.chatDao)
    private val sharedPrefs = application.getSharedPreferences("privchat_prefs", Context.MODE_PRIVATE)

    // Auth States
    private val _isLoggedIn = MutableStateFlow(sharedPrefs.getBoolean("is_logged_in", false))
    val isLoggedIn: StateFlow<Boolean> = _isLoggedIn.asStateFlow()

    private val _myUsername = MutableStateFlow(sharedPrefs.getString("my_username", "") ?: "")
    val myUsername: StateFlow<String> = _myUsername.asStateFlow()

    private val _myEmail = MutableStateFlow(sharedPrefs.getString("my_email", "") ?: "")
    val myEmail: StateFlow<String> = _myEmail.asStateFlow()

    private val _registeredUsername = MutableStateFlow(sharedPrefs.getString("device_registered_username", "") ?: "")
    val registeredUsername: StateFlow<String> = _registeredUsername.asStateFlow()

    private val _registeredEmail = MutableStateFlow(sharedPrefs.getString("device_registered_email", "") ?: "")
    val registeredEmail: StateFlow<String> = _registeredEmail.asStateFlow()

    private val _authError = MutableStateFlow<String?>(null)
    val authError: StateFlow<String?> = _authError.asStateFlow()

    private val _isAuthLoading = MutableStateFlow(false)
    val isAuthLoading: StateFlow<Boolean> = _isAuthLoading.asStateFlow()

    // Dashboard Data Flows
    val allChats: StateFlow<List<Chat>> = repository.allChats
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())

    val allUsers: StateFlow<List<User>> = repository.allUsers
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())

    val allCallLogs: StateFlow<List<CallLog>> = repository.allCallLogs
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())

    // Active Chat Flow
    private val _activeChatId = MutableStateFlow<String?>(null)
    val activeChatId: StateFlow<String?> = _activeChatId.asStateFlow()

    val currentMessages: StateFlow<List<Message>> = _activeChatId
        .flatMapLatest { id ->
            if (id == null) flowOf(emptyList()) else repository.getMessagesForChat(id)
        }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())

    // Simulated Typing Vibe
    private val _typingStatus = MutableStateFlow<String?>(null) // e.g. "Sneha is typing..."
    val typingStatus: StateFlow<String?> = _typingStatus.asStateFlow()

    // Calling Simulation States
    private val _activeCallContact = MutableStateFlow<User?>(null)
    val activeCallContact: StateFlow<User?> = _activeCallContact.asStateFlow()

    private val _isCallVideo = MutableStateFlow(false)
    val isCallVideo: StateFlow<Boolean> = _isCallVideo.asStateFlow()

    private val _callState = MutableStateFlow(CallState.NONE)
    val callState: StateFlow<CallState> = _callState.asStateFlow()

    private val _callDurationSeconds = MutableStateFlow(0)
    val callDurationSeconds: StateFlow<Int> = _callDurationSeconds.asStateFlow()

    private var callTimerJob: Job? = null
    private var simulatedResponseJob: Job? = null

    init {
        // If already logged in, seed/ensure current user exists in database
        if (_isLoggedIn.value) {
            viewModelScope.launch {
                repository.seedContactsIfEmpty(_myUsername.value, _myEmail.value)
            }
        }

        // Start Global Live Chat synchronize thread
        viewModelScope.launch(kotlinx.coroutines.Dispatchers.IO) {
            startGlobalSyncLoop()
        }
    }

    // --- Authentication Actions ---
    fun registerAndLogin(username: String, email: String) {
        val trimmedUsername = username.trim()
        val trimmedEmail = email.trim()

        if (trimmedUsername.length < 3) {
            _authError.value = "Username must be at least 3 characters!"
            return
        }
        if (!android.util.Patterns.EMAIL_ADDRESS.matcher(trimmedEmail).matches()) {
            _authError.value = "Please enter a valid email address!"
            return
        }

        // --- Single Device Single User Check ---
        val deviceRegEmail = sharedPrefs.getString("device_registered_email", "") ?: ""
        val deviceRegUser = sharedPrefs.getString("device_registered_username", "") ?: ""
        if (deviceRegEmail.isNotEmpty() && (deviceRegEmail != trimmedEmail || deviceRegUser != trimmedUsername)) {
            _authError.value = "Security Violation: This device is registered to another user account ($deviceRegUser)."
            return
        }

        _authError.value = null
        _isAuthLoading.value = true

        viewModelScope.launch {
            try {
                // Seed everything in the database
                repository.seedContactsIfEmpty(trimmedUsername, trimmedEmail)

                // Save session in SharedPreferences
                val editor = sharedPrefs.edit()
                    .putBoolean("is_logged_in", true)
                    .putString("my_username", trimmedUsername)
                    .putString("my_email", trimmedEmail)
                
                if (deviceRegEmail.isEmpty()) {
                    editor.putString("device_registered_username", trimmedUsername)
                    editor.putString("device_registered_email", trimmedEmail)
                    _registeredUsername.value = trimmedUsername
                    _registeredEmail.value = trimmedEmail
                }
                editor.apply()

                _myUsername.value = trimmedUsername
                _myEmail.value = trimmedEmail
                _isLoggedIn.value = true
                Log.d("ChatViewModel", "Registered successfully: $trimmedUsername ($trimmedEmail)")
            } catch (e: Exception) {
                _authError.value = "Registration failed: ${e.localizedMessage}"
                Log.e("ChatViewModel", "Auth error", e)
            } finally {
                _isAuthLoading.value = false
            }
        }
    }

    fun logout() {
        viewModelScope.launch {
            // Delete DB records
            db.chatDao.deleteAllMessages()
            db.chatDao.deleteAllChats()
            db.chatDao.deleteAllCallLogs()

            // Keep the registered user persistent so no other user can login/register on this device
            sharedPrefs.edit()
                .putBoolean("is_logged_in", false)
                .putString("my_username", "")
                .putString("my_email", "")
                .putStringSet("synced_global_keys", emptySet())
                .apply()

            _isLoggedIn.value = false
            _myUsername.value = ""
            _myEmail.value = ""
            _activeChatId.value = null
        }
    }

    fun clearDeviceProfile() {
        viewModelScope.launch {
            logout()
            sharedPrefs.edit()
                .putString("device_registered_username", "")
                .putString("device_registered_email", "")
                .apply()
            _registeredUsername.value = ""
            _registeredEmail.value = ""
        }
    }

    // --- Chat Nav & Read State ---
    fun setActiveChat(chatId: String?) {
        _activeChatId.value = chatId
        if (chatId != null) {
            viewModelScope.launch {
                repository.resetUnreadCount(chatId)
            }
        }
    }

    // --- Dynamic User Connection Loop ---
    fun createCustomContact(username: String, email: String) {
        viewModelScope.launch {
            repository.createCustomContact(username, email)
        }
    }

    // --- Sending Messages ---
    fun sendTextMessage(text: String) {
        val chatId = _activeChatId.value ?: return
        if (text.isBlank()) return

        viewModelScope.launch {
            val message = Message(
                chatId = chatId,
                senderId = 0, // Me
                senderName = _myUsername.value,
                content = text,
                isEncrypted = true,
                status = 1 // Delivered gray ticks immediately
            )
            repository.insertMessage(message)
            
            if (chatId == "group_main") {
                publishMessageGlobally(message)
            }

            // Simulating double read ticks after 800ms
            delay(800)
            val updatedMsg = message.copy(status = 2) // Read tick
            db.chatDao.insertMessage(updatedMsg)

            // Trigger AI/Simulated typing response
            if (chatId != "group_main") {
                triggerDelayedReply(chatId, text)
            }
        }
    }

    fun sendMediaAttachment(type: String) {
        val chatId = _activeChatId.value ?: return
        val now = System.currentTimeMillis()

        val (contentStr, mediaUrl, size) = when (type) {
            "IMAGE" -> Triple("📸 photo_secure_$now.jpg", "MOCK_IMG_URL", "1.4 MB")
            "VIDEO" -> Triple("🎥 recording_private_$now.mp4", "MOCK_VID_URL", "8.2 MB")
            "DOCUMENT" -> Triple("📄 backup_keys_$now.pdf", "MOCK_DOC_URL", "410 KB")
            "AUDIO" -> Triple("🎵 audio_note_$now.mp3", "MOCK_AUD_URL", "1.1 MB")
            else -> Triple("📦 shared_asset.zip", "MOCK_FILE_URL", "12.0 MB")
        }

        viewModelScope.launch {
            val message = Message(
                chatId = chatId,
                senderId = 0,
                senderName = _myUsername.value,
                content = contentStr,
                mediaType = type,
                mediaUrl = mediaUrl,
                mediaSize = size,
                isEncrypted = true,
                status = 1
            )
            repository.insertMessage(message)

            if (chatId == "group_main") {
                publishMessageGlobally(message)
            }

            delay(1000)
            db.chatDao.insertMessage(message.copy(status = 2))

            // Trigger corresponding reaction reply
            if (chatId != "group_main") {
                triggerDelayedReply(chatId, "Sent a media attachment: $type")
            }
        }
    }

    // --- Interactive Real-time Reply Engine (Gemini / Fallback) ---
    private fun triggerDelayedReply(chatId: String, matchedPrompt: String) {
        simulatedResponseJob?.cancel()
        simulatedResponseJob = viewModelScope.launch {
            if (chatId == "chatgpt") {
                _typingStatus.value = "ChatGPT is thinking..."
                delay(1200 + (500..1500).random().toLong())
                
                val replyText = GeminiHelper.getChatGPTReply(
                    receiverName = _myUsername.value.ifEmpty { "User" },
                    userMessage = matchedPrompt
                )
                _typingStatus.value = null
                
                val replyMessage = Message(
                    chatId = "chatgpt",
                    senderId = 100,
                    senderName = "NOVA ChatGPT AI 🤖",
                    content = replyText,
                    isEncrypted = true,
                    status = 2
                )
                repository.insertMessage(replyMessage)
                return@launch
            }

            delay(1500 + (1000..2500).random().toLong()) // natural hesitation pause

            val isGroup = chatId == "group_main"
            val senderId: Int
            val senderName: String

            if (isGroup) {
                // Pick a random participant from 1..14 (Sneha, Vicky, Priya, Akash, Kabir, Ananya)
                val responders = listOf(
                    Pair(1, "Sneha Sharma"),
                    Pair(3, "Priya Chopra"),
                    Pair(4, "Akash Verma"),
                    Pair(6, "Ananya Roy"),
                    Pair(2, "Vicky Kaushik")
                )
                val chosen = responders.random()
                senderId = chosen.first
                senderName = chosen.second
            } else {
                // Direct chat: extract partner ID from "direct_{userId}"
                val targetIdStr = chatId.removePrefix("direct_")
                senderId = targetIdStr.toIntOrNull() ?: 1
                val partner = repository.getUserById(senderId)
                senderName = partner?.username ?: "Sneha Sharma"
            }

            // Show "typing..."
            _typingStatus.value = "$senderName is typing..."
            delay(2000 + (1000..2000).random().toLong()) // typing delay

            val otherMemberNames = listOf(
                "Sneha", "Vicky", "Priya", "Akash", "Kabir", "Ananya", "Amit", "Meera"
            )
            
            // Get reply from Gemini REST helper
            val replyText = GeminiHelper.getModelReply(
                senderName = senderName,
                receiverName = _myUsername.value.ifEmpty { "User" },
                userMessage = matchedPrompt,
                isGroupChat = isGroup,
                groupMemberNames = otherMemberNames
            )

            // Clear typing bubble
            _typingStatus.value = null

            // Insert simulated message
            val replyMessage = Message(
                chatId = chatId,
                senderId = senderId,
                senderName = senderName,
                content = replyText,
                isEncrypted = true,
                status = 2
            )
            repository.insertMessage(replyMessage)

            // Random Feature: Occasionally, a contact will initiate an incoming call a few seconds after a chat reply
            // This happens, say, if the user sent a message containing "call" or "video" or 10% chance otherwise!
            val query = matchedPrompt.lowercase()
            if (query.contains("call") || query.contains("video") || (1..100).random() < 8) {
                delay(3000)
                val contactUser = repository.getUserById(senderId)
                if (contactUser != null && _callState.value == CallState.NONE) {
                    launchIncomingCallSim(contactUser, query.contains("video"))
                }
            }
        }
    }

    // --- Dynamic Calling Visual Overlay Simulation ---
    fun initiateOutgoingCall(contact: User, isVideo: Boolean) {
        _activeCallContact.value = contact
        _isCallVideo.value = isVideo
        _callState.value = CallState.RINGING
        _callDurationSeconds.value = 0

        viewModelScope.launch {
            // Ringing state for 3 seconds
            delay(3000)
            if (_callState.value == CallState.RINGING) {
                _callState.value = CallState.CONNECTED
                startCallTimer()
            }
        }
    }

    private fun launchIncomingCallSim(contact: User, isVideo: Boolean) {
        if (_callState.value != CallState.NONE) return
        _activeCallContact.value = contact
        _isCallVideo.value = isVideo
        _callState.value = CallState.INCOMING
        _callDurationSeconds.value = 0
    }

    fun acceptIncomingCall() {
        if (_callState.value == CallState.INCOMING) {
            _callState.value = CallState.CONNECTED
            startCallTimer()
        }
    }

    fun endOrRejectCall() {
        val currentContact = _activeCallContact.value
        val currentState = _callState.value
        val isVideoCall = _isCallVideo.value
        val finalDuration = _callDurationSeconds.value

        if (currentState == CallState.NONE) return

        // Stop timer
        callTimerJob?.cancel()
        callTimerJob = null

        _callState.value = CallState.DISCONNECTED

        viewModelScope.launch {
            // Save Call Log
            if (currentContact != null) {
                val wasAnswered = currentState == CallState.CONNECTED || currentState == CallState.RINGING
                val durationText = if (currentState == CallState.CONNECTED) {
                    val m = finalDuration / 60
                    val s = finalDuration % 60
                    String.format("%02d:%02d", m, s)
                } else if (currentState == CallState.INCOMING) {
                    "Missed"
                } else {
                    "00:00"
                }

                repository.insertCallLog(
                    CallLog(
                        contactId = currentContact.id,
                        contactName = currentContact.username,
                        avatarColor = currentContact.avatarColor,
                        timestamp = System.currentTimeMillis(),
                        isVideo = isVideoCall,
                        isIncoming = currentState == CallState.INCOMING,
                        wasAnswered = wasAnswered,
                        durationText = durationText
                    )
                )
            }

            // Small cooldown on disconnected overlay for tactile feedback
            delay(1200)
            _callState.value = CallState.NONE
            _activeCallContact.value = null
        }
    }

    private fun startCallTimer() {
        callTimerJob?.cancel()
        callTimerJob = viewModelScope.launch {
            while (true) {
                delay(1000)
                _callDurationSeconds.value += 1
                
                // Call timeout simulation (auto disconnect after 5 minutes of simulated conversation)
                if (_callDurationSeconds.value >= 300) {
                    endOrRejectCall()
                    break
                }
            }
        }
    }

    fun formatDuration(totalSeconds: Int): String {
        val minutes = totalSeconds / 60
        val seconds = totalSeconds % 60
        return String.format("%02d:%02d", minutes, seconds)
    }

    // --- Secure locker states ---
    private val _secureLockerPin = MutableStateFlow("1234") // Default: 1234
    val secureLockerPin: StateFlow<String> = _secureLockerPin.asStateFlow()

    private val _isLockerUnlocked = MutableStateFlow(false)
    val isLockerUnlocked: StateFlow<Boolean> = _isLockerUnlocked.asStateFlow()

    private val _vaultItems = MutableStateFlow(listOf(
        VaultItem("Project Specs.pdf", "4.2 MB • Zoya Sen", "IMAGE", "AES-256 Verified"),
        VaultItem("Cryptographic_Private_Keys.pem", "12 KB • Kabir Singh", "DOCUMENT", "ECC Secp256k1 Verified"),
        VaultItem("Finances_Q2_Loop.xlsx", "840 KB • Sameer Rao", "DOCUMENT", "AES-256 Verified"),
        VaultItem("Symmetric_Circle_Backup.txt", "45 KB • Admin", "DOCUMENT", "Chacha20 Verified")
    ))
    val vaultItems: StateFlow<List<VaultItem>> = _vaultItems.asStateFlow()

    fun updateLockerPin(newPin: String) {
        if (newPin.length == 4) {
            _secureLockerPin.value = newPin
        }
    }

    fun setLockerUnlocked(unlocked: Boolean) {
        _isLockerUnlocked.value = unlocked
    }

    fun addVaultItem(name: String, sizeText: String, type: String) {
        val currentList = _vaultItems.value.toMutableList()
        currentList.add(0, VaultItem(name, "$sizeText • Me", type, "AES-256 Secured"))
        _vaultItems.value = currentList
    }

    // --- GLOBAL SYNCHRONIZE LIVE METHODS ---
    private fun publishMessageGlobally(msg: Message) {
        viewModelScope.launch(kotlinx.coroutines.Dispatchers.IO) {
            try {
                val jsonString = serializeMessage(msg)
                val client = okhttp3.OkHttpClient()
                val mediaType = "application/json; charset=utf-8".toMediaTypeOrNull()
                val body = okhttp3.RequestBody.create(mediaType, jsonString)
                
                // Track key in local set immediately to prevent duplicate download in list polling
                val timestamp = msg.timestamp
                val randomId = (100000..999999).random()
                val key = "msg_${timestamp}_${randomId}"
                
                val syncedSet = sharedPrefs.getStringSet("synced_global_keys", emptySet())?.toMutableSet() ?: mutableSetOf()
                syncedSet.add(key)
                sharedPrefs.edit().putStringSet("synced_global_keys", syncedSet).apply()

                val request = okhttp3.Request.Builder()
                    .url("https://kvdb.io/privchat_global_live_chat_v2_9fcd42/$key")
                    .post(body)
                    .build()
                
                client.newCall(request).execute().use { response ->
                    if (!response.isSuccessful) {
                        Log.e("ChatViewModel", "Global write error: ${response.code}")
                    } else {
                        Log.d("ChatViewModel", "Published global key: $key")
                    }
                }
            } catch (e: Exception) {
                Log.e("ChatViewModel", "Global sync exception", e)
            }
        }
    }

    private suspend fun startGlobalSyncLoop() {
        val client = okhttp3.OkHttpClient.Builder()
            .connectTimeout(5, java.util.concurrent.TimeUnit.SECONDS)
            .readTimeout(5, java.util.concurrent.TimeUnit.SECONDS)
            .build()

        while (true) {
            if (!_isLoggedIn.value) {
                delay(3000)
                continue
            }

            try {
                // Fetch newline separated list of keys having prefix "msg_"
                val request = okhttp3.Request.Builder()
                    .url("https://kvdb.io/privchat_global_live_chat_v2_9fcd42/?prefix=msg_")
                    .build()

                client.newCall(request).execute().use { response ->
                    if (response.isSuccessful) {
                        val bodyString = response.body?.string() ?: ""
                        val keys = bodyString.split("\n")
                            .map { it.trim() }
                            .filter { it.isNotEmpty() }

                        // Sort keys (msg_timestamp_randomId -> string-sort matches chronological order)
                        val sortedKeys = keys.sorted()

                        val syncedSet = sharedPrefs.getStringSet("synced_global_keys", emptySet())?.toMutableSet() ?: mutableSetOf()
                        var changed = false

                        // If syncedSet is empty (first run or cleared after logout), skip downloading ancient messages.
                        // We will auto-mark older keys as synced directly, leaving only the latest 15 messages to be downloaded.
                        if (syncedSet.isEmpty() && sortedKeys.size > 15) {
                            val olderKeys = sortedKeys.dropLast(15)
                            syncedSet.addAll(olderKeys)
                            changed = true
                        }

                        // Filter down to the keys we haven't synced yet
                        val unsyncedKeys = sortedKeys.filter { !syncedSet.contains(it) }
                        
                        // Restrict downloading to a maximum of 10 messages per loop to prevent rate-limitation or network saturation
                        val keysToFetch = unsyncedKeys.take(10)

                        // If there is an excessive backlog of unsynced keys, auto-sync/skip the excess to keep the app lag-free
                        if (unsyncedKeys.size > 10) {
                            val excessKeys = unsyncedKeys.drop(10)
                            syncedSet.addAll(excessKeys)
                            changed = true
                        }

                        for (key in keysToFetch) {
                            try {
                                val singleRequest = okhttp3.Request.Builder()
                                    .url("https://kvdb.io/privchat_global_live_chat_v2_9fcd42/$key")
                                    .build()

                                client.newCall(singleRequest).execute().use { singleResponse ->
                                    if (singleResponse.isSuccessful) {
                                        val contentJson = singleResponse.body?.string() ?: ""
                                        val parsed = deserializeMessage(contentJson)
                                        if (parsed != null) {
                                            // Process if not our own sender name
                                            if (parsed.senderName != _myUsername.value) {
                                                // Save locally
                                                repository.insertMessage(parsed.copy(id = 0))
                                            }
                                        }
                                    }
                                }
                                syncedSet.add(key)
                                changed = true
                            } catch (singleEx: Exception) {
                                Log.e("ChatViewModel", "Error fetching single global message $key: ${singleEx.message}")
                            }
                        }

                        if (changed) {
                            sharedPrefs.edit().putStringSet("synced_global_keys", syncedSet).apply()
                        }
                    }
                }
            } catch (e: Exception) {
                Log.e("ChatViewModel", "Polling loop cycle error: ${e.message}")
            }

            delay(3000)
        }
    }

    private fun serializeMessage(msg: Message): String {
        val escapedContent = msg.content.replace("\\", "\\\\").replace("\"", "\\\"").replace("\n", "\\n")
        val escapedSenderName = msg.senderName.replace("\\", "\\\\").replace("\"", "\\\"")
        val escapedMediaType = msg.mediaType?.replace("\"", "\\\"")
        val escapedMediaUrl = msg.mediaUrl?.replace("\"", "\\\"")
        val escapedMediaSize = msg.mediaSize?.replace("\"", "\\\"")
        
        return """{
            "chatId": "group_main",
            "senderId": 12,
            "senderName": "$escapedSenderName",
            "content": "$escapedContent",
            "timestamp": ${msg.timestamp},
            "isEncrypted": ${msg.isEncrypted},
            "status": ${msg.status},
            "mediaType": ${if (escapedMediaType == null) "null" else "\"$escapedMediaType\""},
            "mediaUrl": ${if (escapedMediaUrl == null) "null" else "\"$escapedMediaUrl\""},
            "mediaSize": ${if (escapedMediaSize == null) "null" else "\"$escapedMediaSize\""}
        }""".trimIndent()
    }

    private fun deserializeMessage(json: String): Message? {
        try {
            fun getField(field: String): String? {
                val key = "\"$field\""
                val idx = json.indexOf(key)
                if (idx == -1) return null
                val startColon = json.indexOf(":", idx + key.length)
                if (startColon == -1) return null
                
                var currentIdx = startColon + 1
                while (currentIdx < json.length && json[currentIdx].isWhitespace()) {
                    currentIdx++
                }
                if (currentIdx >= json.length) return null
                
                if (json[currentIdx] == '"') {
                    val valStart = currentIdx + 1
                    var valEscaped = false
                    var valEnd = valStart
                    while (valEnd < json.length) {
                        if (json[valEnd] == '"' && !valEscaped) {
                            break
                        }
                        valEscaped = json[valEnd] == '\\' && !valEscaped
                        valEnd++
                    }
                    return json.substring(valStart, valEnd)
                        .replace("\\\\", "\\")
                        .replace("\\\"", "\"")
                        .replace("\\n", "\n")
                } else {
                    var valEnd = currentIdx
                    while (valEnd < json.length && json[valEnd] != ',' && json[valEnd] != '}' && json[valEnd] != ']') {
                        valEnd++
                    }
                    val rawVal = json.substring(currentIdx, valEnd).trim()
                    if (rawVal == "null") return null
                    return rawVal
                }
            }

            val chatId = getField("chatId") ?: "group_main"
            val senderId = getField("senderId")?.toIntOrNull() ?: 12
            val senderName = getField("senderName") ?: "Global Active Chat User"
            val content = getField("content") ?: ""
            val timestamp = getField("timestamp")?.toLongOrNull() ?: System.currentTimeMillis()
            val isEncrypted = getField("isEncrypted")?.toBoolean() ?: true
            val status = getField("status")?.toIntOrNull() ?: 2
            val mediaType = getField("mediaType")
            val mediaUrl = getField("mediaUrl")
            val mediaSize = getField("mediaSize")

            return Message(
                id = 0,
                chatId = chatId,
                senderId = senderId,
                senderName = senderName,
                content = content,
                timestamp = timestamp,
                isEncrypted = isEncrypted,
                status = status,
                mediaType = mediaType,
                mediaUrl = mediaUrl,
                mediaSize = mediaSize
            )
        } catch (e: Exception) {
            e.printStackTrace()
            return null
        }
    }

    override fun onCleared() {
        super.onCleared()
        callTimerJob?.cancel()
        simulatedResponseJob?.cancel()
    }
}

data class VaultItem(
    val name: String,
    val details: String,
    val type: String,
    val securityStatus: String
)
