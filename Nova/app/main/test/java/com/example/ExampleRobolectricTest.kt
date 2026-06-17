package com.example

import android.app.Application
import android.content.Context
import androidx.test.core.app.ApplicationProvider
import com.example.data.*
import com.example.ui.ChatViewModel
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class ExampleRobolectricTest {

  @Test
  fun `read string from context`() {
    val context = ApplicationProvider.getApplicationContext<Context>()
    val appName = context.getString(R.string.app_name)
    assertEquals("NOVA", appName)
  }

  @Test
  fun `test viewModel initialization`() {
    val application = ApplicationProvider.getApplicationContext<Application>()
    val viewModel = ChatViewModel(application)
    assertNotNull(viewModel)
  }

  @Test
  fun `test MainActivity construction or launch`() {
    try {
      val context = ApplicationProvider.getApplicationContext<Context>()
      val controller = org.robolectric.Robolectric.buildActivity(MainActivity::class.java).setup()
      assertNotNull(controller.get())
    } catch (e: Exception) {
      e.printStackTrace()
      throw e
    }
  }

  @Test
  fun `test database and dao insertion and flow retrieval`(): Unit = runBlocking {
    val application = ApplicationProvider.getApplicationContext<Application>()
    val db = AppDatabase.getDatabase(application)
    val dao = db.chatDao

    // Test cleaning
    dao.deleteAllMessages()
    dao.deleteAllChats()
    dao.deleteAllCallLogs()

    // Test User
    val user = User(
        id = 999,
        username = "Test User",
        email = "test@example.com",
        statusText = "Testing",
        avatarColor = 0xFF123456,
        isOnline = true,
        securityVerificationCode = "12345"
    )
    dao.insertUser(user)
    val fetchedUser = dao.getUserById(999)
    assertNotNull(fetchedUser)
    assertEquals("Test User", fetchedUser?.username)

    // Test Chat
    val chat = Chat(
        id = "test_chat_id",
        name = "Test Chat",
        lastMessage = "Hello",
        lastMsgTimestamp = System.currentTimeMillis(),
        isGroup = false,
        unreadCount = 1
    )
    dao.insertChat(chat)
    val chatsList = dao.getAllChats().first()
    assertEquals(1, chatsList.size)
    assertEquals("test_chat_id", chatsList[0].id)

    // Test Message
    val message = Message(
        chatId = "test_chat_id",
        senderId = 999,
        senderName = "Test User",
        content = "Hello there",
        timestamp = System.currentTimeMillis()
    )
    dao.insertMessage(message)
    val fetchedMessages = dao.getMessagesForChat("test_chat_id").first()
    assertEquals(1, fetchedMessages.size)
    assertEquals("Hello there", fetchedMessages[0].content)

    // Test CallLog
    val call = CallLog(
        contactId = 999,
        contactName = "Test User",
        avatarColor = 0xFF123456,
        timestamp = System.currentTimeMillis(),
        isVideo = false,
        isIncoming = true,
        wasAnswered = true,
        durationText = "01:23"
    )
    dao.insertCallLog(call)
    val fetchedCalls = dao.getAllCallLogs().first()
    assertEquals(1, fetchedCalls.size)
    assertEquals("Test User", fetchedCalls[0].contactName)
  }
}
