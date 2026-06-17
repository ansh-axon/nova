package com.example.api

import android.util.Log
import com.example.BuildConfig
import com.squareup.moshi.JsonClass
import com.squareup.moshi.Moshi
import com.squareup.moshi.kotlin.reflect.KotlinJsonAdapterFactory
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.OkHttpClient
import retrofit2.Retrofit
import retrofit2.converter.moshi.MoshiConverterFactory
import retrofit2.http.Body
import retrofit2.http.POST
import retrofit2.http.Query
import java.util.concurrent.TimeUnit

@JsonClass(generateAdapter = true)
data class GeminiRequest(
    val contents: List<Content>,
    val systemInstruction: Content? = null
)

@JsonClass(generateAdapter = true)
data class Content(
    val parts: List<Part>
)

@JsonClass(generateAdapter = true)
data class Part(
    val text: String
)

@JsonClass(generateAdapter = true)
data class GeminiResponse(
    val candidates: List<Candidate>?
)

@JsonClass(generateAdapter = true)
data class Candidate(
    val content: Content?
)

interface GeminiApiService {
    @POST("v1beta/models/gemini-3.5-flash:generateContent")
    suspend fun generateContent(
        @Query("key") apiKey: String,
        @Body request: GeminiRequest
    ): GeminiResponse
}

object RetrofitClient {
    private const val BASE_URL = "https://generativelanguage.googleapis.com/"

    private val moshi = Moshi.Builder()
        .addLast(KotlinJsonAdapterFactory())
        .build()

    private val okHttpClient = OkHttpClient.Builder()
        .connectTimeout(30, TimeUnit.SECONDS)
        .readTimeout(30, TimeUnit.SECONDS)
        .writeTimeout(30, TimeUnit.SECONDS)
        .build()

    val service: GeminiApiService by lazy {
        Retrofit.Builder()
            .baseUrl(BASE_URL)
            .client(okHttpClient)
            .addConverterFactory(MoshiConverterFactory.create(moshi))
            .build()
            .create(GeminiApiService::class.java)
    }
}

class GeminiHelper {
    companion object {
        private const val TAG = "GeminiHelper"
        
        // Retrieve the API key from BuildConfig (populated by secrets system)
        val apiKey: String = BuildConfig.GEMINI_API_KEY

        suspend fun getModelReply(
            senderName: String,
            receiverName: String,
            userMessage: String,
            isGroupChat: Boolean,
            groupMemberNames: List<String> = emptyList()
        ): String = withContext(Dispatchers.IO) {
            if (apiKey.isEmpty() || apiKey == "MY_GEMINI_API_KEY") {
                Log.w(TAG, "Gemini API key is unconfigured. Using local fallback simulation.")
                return@withContext getLocalSimulationResponse(senderName, userMessage, isGroupChat)
            }

            val systemPrompt = if (isGroupChat) {
                """
                You are $senderName, a close friend in a private 15-member WhatsApp group.
                The other members are: ${groupMemberNames.joinToString(", ")}.
                The user's name is $receiverName.
                Respond to $receiverName's message: "$userMessage".
                Keep it very short (1-2 sentences), conversational, friendly, and in Hinglish/Hindi or casual English.
                Respond naturally, using occasional chat abbreviations (like "bro", "chal", "kya haal", "hmm") or emojis.
                Do NOT include metadata, system text, or your name. Just write the chat message.
                """.trimIndent()
            } else {
                """
                You are $senderName, a close friend chatting on WhatsApp with $receiverName.
                Respond to $receiverName's message: "$userMessage".
                Keep it very short (1-2 sentences), warm, and highly casual.
                Write in Hinglish (Hindi written in English alphabets) or conversational Hindi/English.
                Maintain a true friendly vibe. Use chat short forms (e.g., "acha", "bro", "kaha hai", "haha", "ok", "cool").
                Do NOT include introductory phrases or your name. Just say the chat message response directly.
                """.trimIndent()
            }

            try {
                val request = GeminiRequest(
                    contents = listOf(
                        Content(parts = listOf(Part(text = "Respond to: $userMessage")))
                    ),
                    systemInstruction = Content(parts = listOf(Part(text = systemPrompt)))
                )
                val response = RetrofitClient.service.generateContent(apiKey, request)
                val text = response.candidates?.firstOrNull()?.content?.parts?.firstOrNull()?.text
                if (!text.isNullOrBlank()) {
                    return@withContext text.trim()
                }
                return@withContext getLocalSimulationResponse(senderName, userMessage, isGroupChat)
            } catch (e: Exception) {
                Log.e(TAG, "Gemini API call failed: ${e.message}. Using backup helper.", e)
                return@withContext getLocalSimulationResponse(senderName, userMessage, isGroupChat)
            }
        }

        suspend fun getChatGPTReply(
            receiverName: String,
            userMessage: String
        ): String = withContext(Dispatchers.IO) {
            if (apiKey.isEmpty() || apiKey == "MY_GEMINI_API_KEY") {
                Log.w(TAG, "Gemini API key is unconfigured. Using local fallback simulation for ChatGPT.")
                return@withContext "I am NOVA ChatGPT! Note: Your Gemini API Key is currently not set up in your secrets. If you configure GEMINI_API_KEY under the Settings/Secrets panel, I will respond with live GPT-level answers instantly. Let's start chatting anyway! Query matched: $userMessage"
            }

            val systemPrompt = """
                You are NOVA ChatGPT, a highly advanced secure AI companion inside the end-to-end encrypted app.
                The user you are replying to is "$receiverName".
                Be helpful, polite, extremely intelligent, concise, and professional.
                Support both Hindi/Hinglish and English natively.
                Give accurate, highly privacy-focused replies. Keep it authentic.
            """.trimIndent()

            try {
                val request = GeminiRequest(
                    contents = listOf(
                        Content(parts = listOf(Part(text = "Respond to user's question: $userMessage")))
                    ),
                    systemInstruction = Content(parts = listOf(Part(text = systemPrompt)))
                )
                val response = RetrofitClient.service.generateContent(apiKey, request)
                val text = response.candidates?.firstOrNull()?.content?.parts?.firstOrNull()?.text
                if (!text.isNullOrBlank()) {
                    return@withContext text.trim()
                }
                return@withContext "Error: No response generated from AI server."
            } catch (e: Exception) {
                Log.e(TAG, "ChatGPT API call failed: ${e.message}", e)
                return@withContext "Connection issue: ${e.localizedMessage}. Please secure your Internet connection or verify security secrets."
            }
        }

        private fun getLocalSimulationResponse(senderName: String, userMessage: String, isGroupChat: Boolean): String {
            val query = userMessage.lowercase()
            return when {
                query.contains("hello") || query.contains("hi") || query.contains("hey") -> {
                    listOf(
                        "Hey bro! Kaise ho?",
                        "Hello! Sab badhiya?",
                        "Hi user! Kya chal raha hai?",
                        "Heyy! WhatsApp pe active kaise ho aaj kal haha."
                    ).random()
                }
                query.contains("kya chal") || query.contains("kya ho") || query.contains("whatsapp") -> {
                    listOf(
                        "Kuch nahi yaar, bas chill kar rahe the.",
                        "Bas abhi thoda code dekh raha tha. Aur batao?",
                        "Nothing much, just normal day. Tu bata?",
                        "Apna bolo, kaisa hai sab?"
                    ).random()
                }
                query.contains("college") || query.contains("class") || query.contains("lecture") -> {
                    listOf(
                        "Haan kal chalte hain! Timing batana busy hai?",
                        "Kal toh hum sab bunk karne ka soch rahe hain haha.",
                        "Yaar assignment pending hai, aaj poora karna hai."
                    ).random()
                }
                query.contains("call") || query.contains("video") || query.contains("voice") -> {
                    listOf(
                        "Abhi thoda busy hu, thodi der mein video call karta hu?",
                        "Haan direct dial karle, line clean hai standard WhatsApp call support pe.",
                        "Call check kiya maine, awaz bilkul clear aa rahi hai bro!"
                    ).random()
                }
                query.contains("code") || query.contains("app") || query.contains("encryption") || query.contains("e2ee") -> {
                    listOf(
                        "Bhai encryption bohot solid lagaya hai, keys verified hain code screen pe.",
                        "Zero delay messaging design kiya hai Room DB ke saath. Instant reply aa raha hai!",
                        "Database check kiya hai, local encryption keys 60-digit verified hain!"
                    ).random()
                }
                query.contains("kaha") || query.contains("where") -> {
                    listOf(
                        "Ghar pe hu yaar abhi. Tu?",
                        "Bahari tha thoda kaam se, abhi ghar pahucha.",
                        "Office mein hu bro, 10 min mein reply deta hu."
                    ).random()
                }
                else -> {
                    if (isGroupChat) {
                        listOf(
                            "Sahi baat hai! Hum sab group mein bilkul real-time hain.",
                            "Haha true! Private 15 member limit makes it so safe 🔒.",
                            "Nice! Aaj party hai kya phir?",
                            "Awesome bro! PrivCircle rocks."
                        ).random()
                    } else {
                        listOf(
                            "Achha, samajh gaya! Aur batao?",
                            "Haha sahi hai! Bilkul sahi baat boli.",
                            "Wow! Sahi laga sunkar. Chalo milte hain.",
                            "Mille kya aaj sham ko? Coffee table set karein?",
                            "Haan bilkul, zero lag message delivery perfect hai!"
                        ).random()
                    }
                }
            }
        }
    }
}
