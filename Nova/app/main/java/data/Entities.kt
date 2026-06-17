package com.example.data

import androidx.room.Entity
import androidx.room.PrimaryKey

@Entity(tableName = "users")
data class User(
    @PrimaryKey val id: Int, // 0 = Me, 1..14 = Preseeded members
    val username: String,
    val email: String,
    val statusText: String,
    val avatarColor: Long, // Hex color value of background gradient
    val isOnline: Boolean = false,
    val securityVerificationCode: String // 60-digit security code for E2EE
)

@Entity(tableName = "chats")
data class Chat(
    @PrimaryKey val id: String, // "group_main" or "direct_{userId}"
    val name: String,
    val lastMessage: String,
    val lastMsgTimestamp: Long,
    val isGroup: Boolean,
    val unreadCount: Int = 0
)

@Entity(tableName = "messages")
data class Message(
    @PrimaryKey(autoGenerate = true) val id: Int = 0,
    val chatId: String,
    val senderId: Int,
    val senderName: String,
    val content: String,
    val timestamp: Long = System.currentTimeMillis(),
    val isEncrypted: Boolean = true,
    val status: Int = 2, // 0 = Sent, 1 = Delivered, 2 = Read (Standard blue ticks for simulation)
    val mediaType: String? = null, // "IMAGE", "VIDEO", "DOCUMENT", "AUDIO", or null for TEXT
    val mediaUrl: String? = null,
    val mediaSize: String? = null
)

@Entity(tableName = "call_logs")
data class CallLog(
    @PrimaryKey(autoGenerate = true) val id: Int = 0,
    val contactId: Int,
    val contactName: String,
    val avatarColor: Long,
    val timestamp: Long = System.currentTimeMillis(),
    val isVideo: Boolean = false,
    val isIncoming: Boolean = false,
    val wasAnswered: Boolean = true,
    val durationText: String = "00:00"
)
