package com.example.ui

import androidx.compose.animation.*
import androidx.compose.animation.core.*
import androidx.compose.foundation.*
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material.icons.outlined.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import com.example.data.*
import com.example.ui.theme.*
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

// --- ROOT NAVIGATION MANAGER ---
@Composable
fun AppNavigation(
    viewModel: ChatViewModel,
    isDarkTheme: Boolean = false,
    onToggleDarkTheme: () -> Unit = {}
) {
    val isLoggedIn by viewModel.isLoggedIn.collectAsState()
    val activeChatId by viewModel.activeChatId.collectAsState()
    val callState by viewModel.callState.collectAsState()
    val callingContact by viewModel.activeCallContact.collectAsState()
    val isVideoCall by viewModel.isCallVideo.collectAsState()

    Box(modifier = Modifier.fillMaxSize()) {
        if (!isLoggedIn) {
            LoginScreen(viewModel = viewModel)
        } else {
            MainDashboardScreen(
                viewModel = viewModel,
                isDarkTheme = isDarkTheme,
                onToggleDarkTheme = onToggleDarkTheme
            )

            // Overlaid detailed chat screen if selected
            AnimatedVisibility(
                visible = activeChatId != null,
                enter = slideInHorizontally(initialOffsetX = { it }, animationSpec = spring(stiffness = Spring.StiffnessLow)),
                exit = slideOutHorizontally(targetOffsetX = { it }, animationSpec = spring(stiffness = Spring.StiffnessMedium))
            ) {
                if (activeChatId != null) {
                    ChatScreen(viewModel = viewModel, chatId = activeChatId!!)
                }
            }
        }

        // Overlay Call Screen on top of everything if in calling state
        AnimatedVisibility(
            visible = callState != CallState.NONE,
            enter = fadeIn(animationSpec = tween(500)),
            exit = fadeOut(animationSpec = tween(400))
        ) {
            if (callingContact != null && callState != CallState.NONE) {
                CallingOverlay(
                    viewModel = viewModel,
                    receiver = callingContact!!,
                    isVideo = isVideoCall,
                    state = callState
                )
            }
        }
    }
}

// --- NATIVE CRASH-PROOF NOVA DESIGN ICON ---
@Composable
fun NovaOriginalIcon(modifier: Modifier = Modifier) {
    Box(
        modifier = modifier
            .clip(RoundedCornerShape(32.dp))
            .background(Color(0xFF040813))
    ) {
        Canvas(modifier = Modifier.fillMaxSize()) {
            val width = size.width
            val height = size.height

            // Scale coordinates from 0-108 viewport to dynamic pixel size
            fun scaleX(x: Float) = x * (width / 108f)
            fun scaleY(y: Float) = y * (height / 108f)

            // 1. Draw Background Grid Lines (matching ic_launcher_background.xml)
            val gridColorOuter = Color.White.copy(alpha = 0.10f)
            val gridColorInner = Color.White.copy(alpha = 0.04f)

            // Outer tech boundary
            drawRect(
                color = gridColorOuter,
                topLeft = Offset(scaleX(18f), scaleY(18f)),
                size = androidx.compose.ui.geometry.Size(scaleX(72f), scaleY(72f)),
                style = Stroke(width = 0.5.dp.toPx())
            )

            // Inner grid lines
            listOf(36f, 54f, 72f).forEach { g ->
                // Vertical lines
                drawLine(
                    color = gridColorInner,
                    start = Offset(scaleX(g), scaleY(18f)),
                    end = Offset(scaleX(g), scaleY(90f)),
                    strokeWidth = 0.25.dp.toPx()
                )
                // Horizontal lines
                drawLine(
                    color = gridColorInner,
                    start = Offset(scaleX(18f), scaleY(g)),
                    end = Offset(scaleX(90f), scaleY(g)),
                    strokeWidth = 0.25.dp.toPx()
                )
            }

            // 2. Helper to draw colored facets
            fun drawTriangle(color: Color, vararg points: Pair<Float, Float>) {
                if (points.size < 3) return
                val path = Path().apply {
                    moveTo(scaleX(points[0].first), scaleY(points[0].second))
                    for (i in 1 until points.size) {
                        lineTo(scaleX(points[i].first), scaleY(points[i].second))
                    }
                    close()
                }
                drawPath(path = path, color = color)
            }

            // 3. Draw Foreground Geometric Shapes (matching ic_launcher_foreground.xml)
            // PIECE 1 (TOP FLOATING)
            drawTriangle(Color(0xFF00F2FE), 51f to 14f, 38f to 36f, 52f to 38f) // Left Facet (Glowing Cyan)
            drawTriangle(Color(0xFF00B0FF), 51f to 14f, 52f to 38f, 77f to 60f) // Right Facet (Bright Electric Blue)

            // PIECE 2 (MAIN BOTTOM-LEFT)
            drawTriangle(Color(0xFF00E5FF), 15f to 87f, 35f to 45f, 46f to 68f) // Left Facet (Light Cyan-Teal)
            drawTriangle(Color(0xFF0091EA), 35f to 45f, 76f to 62f, 46f to 68f) // Right Facet (Ocean Blue)
            drawTriangle(Color(0xFF1A237E), 15f to 87f, 46f to 68f, 76f to 62f) // Bottom Facet (Deep Indigo Blue Shading)

            // PIECE 3 (SMALL BOTTOM-RIGHT)
            drawTriangle(Color(0xFF00E5FF), 60f to 83f, 80f to 71f, 79f to 85f) // Left Facet (Cyan)
            drawTriangle(Color(0xFF3D5AFE), 80f to 71f, 94f to 95f, 79f to 85f) // Right Facet (Electric Deep Blue)
            drawTriangle(Color(0xFF0D47A1), 60f to 83f, 79f to 85f, 94f to 95f) // Bottom Facet (Midnight Navy)
        }
    }
}

// --- ATTRACTIVE LOGIN/REGISTRATION SCREEN ---
@Composable
fun LoginScreen(viewModel: ChatViewModel) {
    val myUsername by viewModel.myUsername.collectAsState()
    val myEmail by viewModel.myEmail.collectAsState()
    val registeredUsername by viewModel.registeredUsername.collectAsState()
    val registeredEmail by viewModel.registeredEmail.collectAsState()
    val authError by viewModel.authError.collectAsState()
    val isAuthLoading by viewModel.isAuthLoading.collectAsState()

    var usernameInput by remember { mutableStateOf("") }
    var emailInput by remember { mutableStateOf("") }
    var showFactoryResetDialog by remember { mutableStateOf(false) }

    LaunchedEffect(registeredUsername, registeredEmail) {
        if (registeredUsername.isNotEmpty()) {
            usernameInput = registeredUsername
            emailInput = registeredEmail
        } else if (myUsername.isNotEmpty()) {
            usernameInput = myUsername
            emailInput = myEmail
        }
    }

    val focusManager = LocalFocusManager.current

    // Infinite transitions for dynamic breathing neon background
    val infiniteTransition = rememberInfiniteTransition(label = "cyber_glow")
    val pulseSize by infiniteTransition.animateFloat(
        initialValue = 0.85f,
        targetValue = 1.15f,
        animationSpec = infiniteRepeatable(
            animation = tween(4500, easing = LinearEasing),
            repeatMode = RepeatMode.Reverse
        ),
        label = "neon_pulse"
    )
    val rotateAngle by infiniteTransition.animateFloat(
        initialValue = 0f,
        targetValue = 360f,
        animationSpec = infiniteRepeatable(
            animation = tween(24000, easing = LinearEasing),
            repeatMode = RepeatMode.Restart
        ),
        label = "neon_rotate"
    )

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(Color(0xFF040810)) // Pure premium OLED dark canvas
    ) {
        // Neon 3D Holographic Ambient Shadows
        Canvas(modifier = Modifier.fillMaxSize()) {
            val centerOffset = Offset(size.width / 2, size.height / 2)
            
            // Rotating neon turquoise center
            drawCircle(
                color = Color(0xFF00F2FE).copy(alpha = 0.09f * pulseSize),
                radius = 320.dp.toPx(),
                center = Offset(
                    centerOffset.x + (100 * Math.cos(Math.toRadians(rotateAngle.toDouble()))).toFloat(),
                    centerOffset.y - (100 * Math.sin(Math.toRadians(rotateAngle.toDouble()))).toFloat()
                )
            )

            // Pulsing ultraviolet center
            drawCircle(
                color = Color(0xFFD435FF).copy(alpha = 0.08f * (2f - pulseSize)),
                radius = 280.dp.toPx(),
                center = Offset(
                    centerOffset.x - (120 * Math.sin(Math.toRadians(rotateAngle.toDouble()))).toFloat(),
                    centerOffset.y + (120 * Math.cos(Math.toRadians(rotateAngle.toDouble()))).toFloat()
                )
            )

            // Neon Mint center at top-right
            drawCircle(
                color = Color(0xFF00FF87).copy(alpha = 0.04f * pulseSize),
                radius = 200.dp.toPx(),
                center = Offset(size.width, 0f)
            )
        }

        Column(
            modifier = Modifier
                .fillMaxSize()
                .windowInsetsPadding(WindowInsets.statusBars)
                .padding(24.dp)
                .verticalScroll(rememberScrollState()),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center
        ) {
            Spacer(modifier = Modifier.height(20.dp))

            // 3D holographic layered ring logo logo
            NovaOriginalIcon(
                modifier = Modifier
                    .size(110.dp)
                    .border(
                        BorderStroke(
                            2.dp,
                            Brush.linearGradient(
                                colors = listOf(Color(0xFF00F2FE), Color(0xFF00FF87), Color(0xFFD435FF))
                            )
                        ),
                        RoundedCornerShape(32.dp)
                    )
            )

            Spacer(modifier = Modifier.height(24.dp))

            Text(
                text = "NOVA SECURE DECK",
                style = MaterialTheme.typography.headlineMedium.copy(
                    fontWeight = FontWeight.Black,
                    color = Color.White,
                    letterSpacing = 4.sp
                ),
                textAlign = TextAlign.Center
            )

            Text(
                text = "Dynamic 3D Cryptographic Workspace",
                style = MaterialTheme.typography.labelSmall.copy(
                    color = Color(0xFF00FF87),
                    fontWeight = FontWeight.Bold,
                    letterSpacing = 2.sp
                ),
                textAlign = TextAlign.Center,
                modifier = Modifier.padding(top = 4.dp, bottom = 28.dp)
            )

            Card(
                modifier = Modifier
                    .fillMaxWidth()
                    .testTag("login_card"),
                shape = RoundedCornerShape(28.dp),
                colors = CardDefaults.cardColors(containerColor = Color(0xFF0F172E).copy(alpha = 0.72f)),
                border = BorderStroke(
                    width = 1.dp,
                    brush = Brush.linearGradient(
                        colors = listOf(
                            Color(0xFF00F2FE).copy(0.5f),
                            Color.Transparent,
                            Color(0xFFD435FF).copy(0.4f)
                        )
                    )
                )
            ) {
                Column(
                    modifier = Modifier.padding(24.dp)
                ) {
                    if (registeredEmail.isNotEmpty()) {
                        // DEVICE IS LOCKED TO 1 REGISTERED PROFILE
                        Text(
                            text = "PERSISTENT PROFILE SEALED",
                            style = MaterialTheme.typography.labelSmall.copy(
                                fontWeight = FontWeight.Black,
                                color = Color(0xFF00FF87),
                                letterSpacing = 2.sp
                            ),
                            modifier = Modifier.padding(bottom = 8.dp)
                        )

                        Text(
                            text = "To protect user privacy loops and prevent session sniffing, this device has locked active credentials to a single secure vault container.",
                            style = MaterialTheme.typography.bodySmall.copy(
                                color = Color(0xFF94A3B8),
                                lineHeight = 16.sp
                            ),
                            modifier = Modifier.padding(bottom = 20.dp)
                        )

                        // Passport glass card
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .clip(RoundedCornerShape(16.dp))
                                .background(Color(0xFF070B13).copy(alpha = 0.9f))
                                .border(1.dp, Color(0xFF334155), RoundedCornerShape(16.dp))
                                .padding(16.dp),
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Box(
                                modifier = Modifier
                                    .size(46.dp)
                                    .clip(CircleShape)
                                    .background(Color(0xFF00FF87).copy(0.12f)),
                                contentAlignment = Alignment.Center
                            ) {
                                Icon(
                                    imageVector = Icons.Default.Person,
                                    contentDescription = null,
                                    tint = Color(0xFF00FF87),
                                    modifier = Modifier.size(24.dp)
                                )
                            }
                            Spacer(modifier = Modifier.width(14.dp))
                            Column {
                                Text(
                                    text = registeredUsername,
                                    style = MaterialTheme.typography.titleMedium.copy(
                                        fontWeight = FontWeight.Bold,
                                        color = Color.White
                                    )
                                )
                                Text(
                                    text = registeredEmail,
                                    style = MaterialTheme.typography.bodySmall.copy(
                                        color = Color(0xFF94A3B8)
                                    )
                                )
                            }
                        }

                        if (authError != null) {
                            Text(
                                text = authError!!,
                                color = Color.Red,
                                style = MaterialTheme.typography.bodySmall,
                                modifier = Modifier.padding(top = 12.dp)
                            )
                        }

                        Spacer(modifier = Modifier.height(24.dp))

                        // Decrypt Button with massive Neon glow effect
                        Button(
                            onClick = {
                                viewModel.registerAndLogin(registeredUsername, registeredEmail)
                            },
                            shape = RoundedCornerShape(16.dp),
                            colors = ButtonDefaults.buttonColors(containerColor = Color.Transparent),
                            contentPadding = PaddingValues(),
                            modifier = Modifier
                                .fillMaxWidth()
                                .height(52.dp)
                                .clip(RoundedCornerShape(16.dp))
                                .background(
                                    Brush.linearGradient(
                                        colors = listOf(Color(0xFF00FF87), Color(0xFF00F2FE))
                                    )
                                ),
                            enabled = !isAuthLoading
                        ) {
                            if (isAuthLoading) {
                                CircularProgressIndicator(color = Color(0xFF040810), modifier = Modifier.size(24.dp))
                            } else {
                                Row(
                                    verticalAlignment = Alignment.CenterVertically,
                                    horizontalArrangement = Arrangement.Center
                                ) {
                                    Icon(Icons.Default.LockOpen, contentDescription = null, tint = Color(0xFF040810), modifier = Modifier.size(18.dp))
                                    Spacer(modifier = Modifier.width(8.dp))
                                    Text(
                                        "DECRYPT VAULT ROOM",
                                        color = Color(0xFF040810),
                                        fontWeight = FontWeight.Black,
                                        fontSize = 14.sp,
                                        letterSpacing = 1.sp
                                    )
                                }
                            }
                        }
                    } else {
                        // INITIAL REGISTRATION FLOW
                        Text(
                            text = "INITIALIZE CODES",
                            style = MaterialTheme.typography.labelSmall.copy(
                                fontWeight = FontWeight.Black,
                                color = Color(0xFF00F2FE),
                                letterSpacing = 2.sp
                            ),
                            modifier = Modifier.padding(bottom = 16.dp)
                        )

                        // Username field
                        OutlinedTextField(
                            value = usernameInput,
                            onValueChange = { usernameInput = it },
                            label = { Text("Display Username", color = Color(0xFF94A3B8)) },
                            placeholder = { Text("e.g. Alex Carter", color = Color(0xFF94A3B8).copy(0.4f)) },
                            leadingIcon = { Icon(Icons.Default.Person, contentDescription = "User", tint = Color(0xFF00F2FE)) },
                            colors = OutlinedTextFieldDefaults.colors(
                                focusedContainerColor = Color(0xFF090E17),
                                unfocusedContainerColor = Color(0xFF0F172A).copy(0.5f),
                                focusedBorderColor = Color(0xFF00F2FE),
                                unfocusedBorderColor = Color(0xFF334155),
                                focusedLabelColor = Color(0xFF00F2FE),
                                unfocusedLabelColor = Color(0xFF94A3B8),
                                focusedTextColor = Color.White,
                                unfocusedTextColor = Color.White
                            ),
                            singleLine = true,
                            keyboardOptions = KeyboardOptions(
                                imeAction = ImeAction.Next,
                                keyboardType = KeyboardType.Text
                            ),
                            modifier = Modifier
                                .fillMaxWidth()
                                .testTag("username_input")
                        )

                        Spacer(modifier = Modifier.height(16.dp))

                        // Email Field
                        OutlinedTextField(
                            value = emailInput,
                            onValueChange = { emailInput = it },
                            label = { Text("Secure Email Address", color = Color(0xFF94A3B8)) },
                            placeholder = { Text("alex@example.com", color = Color(0xFF94A3B8).copy(0.4f)) },
                            leadingIcon = { Icon(Icons.Default.Email, contentDescription = "Email", tint = Color(0xFF00F2FE)) },
                            colors = OutlinedTextFieldDefaults.colors(
                                focusedContainerColor = Color(0xFF090E17),
                                unfocusedContainerColor = Color(0xFF0F172A).copy(0.5f),
                                focusedBorderColor = Color(0xFF00F2FE),
                                unfocusedBorderColor = Color(0xFF334155),
                                focusedLabelColor = Color(0xFF00F2FE),
                                unfocusedLabelColor = Color(0xFF94A3B8),
                                focusedTextColor = Color.White,
                                unfocusedTextColor = Color.White
                            ),
                            singleLine = true,
                            keyboardOptions = KeyboardOptions(
                                imeAction = ImeAction.Done,
                                keyboardType = KeyboardType.Email
                            ),
                            keyboardActions = KeyboardActions(
                                onDone = {
                                    focusManager.clearFocus()
                                    viewModel.registerAndLogin(usernameInput, emailInput)
                                }
                            ),
                            modifier = Modifier
                                .fillMaxWidth()
                                .testTag("email_input")
                        )

                        if (authError != null) {
                            Text(
                                text = authError!!,
                                color = Color.Red,
                                style = MaterialTheme.typography.bodySmall,
                                modifier = Modifier.padding(top = 12.dp)
                            )
                        }

                        Spacer(modifier = Modifier.height(24.dp))

                        Button(
                            onClick = {
                                focusManager.clearFocus()
                                viewModel.registerAndLogin(usernameInput, emailInput)
                            },
                            shape = RoundedCornerShape(16.dp),
                            colors = ButtonDefaults.buttonColors(containerColor = Color.Transparent),
                            contentPadding = PaddingValues(),
                            modifier = Modifier
                                .fillMaxWidth()
                                .height(52.dp)
                                .clip(RoundedCornerShape(16.dp))
                                .background(
                                    Brush.linearGradient(
                                        colors = listOf(Color(0xFF00F2FE), Color(0xFFD435FF))
                                    )
                                )
                                .testTag("submit_button"),
                            enabled = !isAuthLoading
                        ) {
                            if (isAuthLoading) {
                                CircularProgressIndicator(color = Color.White, modifier = Modifier.size(24.dp))
                            } else {
                                Text(
                                    "INITIALIZE VAULT DECK",
                                    color = Color.White,
                                    fontWeight = FontWeight.Black,
                                    fontSize = 13.sp,
                                    letterSpacing = 1.sp
                                )
                            }
                        }
                    }
                }
            }

            Spacer(modifier = Modifier.height(30.dp))

            // Subdued factory reset link for dynamic profile migration
            if (registeredEmail.isNotEmpty()) {
                TextButton(
                    onClick = { showFactoryResetDialog = true }
                ) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Icon(Icons.Default.DeleteSweep, contentDescription = null, tint = Color(0xFFEF4444).copy(0.7f), modifier = Modifier.size(16.dp))
                        Spacer(modifier = Modifier.width(6.dp))
                        Text(
                            text = "Factory Wipe Device Profile",
                            color = Color(0xFFEF4444).copy(alpha = 0.8f),
                            style = MaterialTheme.typography.labelMedium.copy(fontWeight = FontWeight.Bold)
                        )
                    }
                }
            }

            Spacer(modifier = Modifier.height(20.dp))

            // Double security active tagline
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.Center,
                modifier = Modifier.fillMaxWidth()
            ) {
                Icon(
                    imageVector = Icons.Default.VerifiedUser,
                    contentDescription = null,
                    tint = Color(0xFF00FF87),
                    modifier = Modifier.size(16.dp)
                )
                Spacer(modifier = Modifier.width(6.dp))
                Text(
                    text = "AES-256 Quantum Double-Ratchet Enforced",
                    style = MaterialTheme.typography.labelSmall.copy(color = Color(0xFF64748B), fontWeight = FontWeight.Medium)
                )
            }
        }
    }

    if (showFactoryResetDialog) {
        AlertDialog(
            onDismissRequest = { showFactoryResetDialog = false },
            title = {
                Text(
                    "Factory Wipe Vault Profile?",
                    color = Color.White,
                    fontWeight = FontWeight.Bold
                )
            },
            text = {
                Text(
                    "This action securely wipes all local logs, call histories, offline media cache, and E2EE session keys permanently. This cannot be undone.",
                    color = Color(0xFF94A3B8)
                )
            },
            confirmButton = {
                Button(
                    onClick = {
                        showFactoryResetDialog = false
                        viewModel.clearDeviceProfile()
                    },
                    colors = ButtonDefaults.buttonColors(containerColor = Color(0xFFEF4444))
                ) {
                    Text("Proceed Wipe", color = Color.White)
                }
            },
            dismissButton = {
                TextButton(
                    onClick = { showFactoryResetDialog = false }
                ) {
                    Text("Cancel", color = Color(0xFF94A3B8))
                }
            },
            containerColor = Color(0xFF1E293B),
            shape = RoundedCornerShape(24.dp)
        )
    }
}

@Composable
fun BentoSecureBanner() {
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp, vertical = 8.dp),
        colors = CardDefaults.cardColors(
            containerColor = if (isSystemInDarkTheme()) Color(0xFF064E3B) else Color(0xFFD1EADC)
        ),
        shape = RoundedCornerShape(24.dp)
    ) {
        Row(
            modifier = Modifier.padding(16.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Box(
                modifier = Modifier
                    .size(40.dp)
                    .clip(CircleShape)
                    .background(if (isSystemInDarkTheme()) Color(0xFF0F766E).copy(alpha = 0.4f) else Color.White.copy(alpha = 0.6f)),
                contentAlignment = Alignment.Center
            ) {
                Icon(
                    imageVector = Icons.Default.Lock,
                    contentDescription = null,
                    tint = if (isSystemInDarkTheme()) Color(0xFFD1EADC) else Color(0xFF003833),
                    modifier = Modifier.size(20.dp)
                )
            }
            Spacer(modifier = Modifier.width(12.dp))
            Column {
                Text(
                    text = "ENCRYPTION ACTIVE",
                    style = MaterialTheme.typography.labelSmall.copy(
                        fontWeight = FontWeight.Bold,
                        color = if (isSystemInDarkTheme()) Color(0xFFD1EADC).copy(alpha = 0.7f) else Color(0xFF003833).copy(alpha = 0.7f),
                        letterSpacing = 1.sp
                    )
                )
                Text(
                    text = "End-to-end secure for 15-member private groups.",
                    style = MaterialTheme.typography.bodySmall.copy(
                        fontWeight = FontWeight.Medium,
                        color = if (isSystemInDarkTheme()) Color(0xFFD1EADC) else Color(0xFF003833)
                    )
                )
            }
        }
    }
}

@Composable
fun BentoFeaturedGroupsGrid(
    isDarkTheme: Boolean,
    onNavigateToCalls: () -> Unit,
    onOpenVaultDialog: () -> Unit,
    onOpenGroupChat: () -> Unit
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp, vertical = 8.dp),
        horizontalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        // Left Column: Family Vault (col-span-1, aspect-square)
        Card(
            modifier = Modifier
                .weight(1f)
                .aspectRatio(1f)
                .clickable { onOpenGroupChat() },
            colors = CardDefaults.cardColors(
                containerColor = MaterialTheme.colorScheme.surface
            ),
            shape = RoundedCornerShape(28.dp),
            border = BorderStroke(1.dp, MaterialTheme.colorScheme.surfaceVariant),
            elevation = CardDefaults.cardElevation(defaultElevation = 0.5.dp)
        ) {
            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(16.dp),
                verticalArrangement = Arrangement.SpaceBetween
            ) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.Top
                ) {
                    Box(
                        modifier = Modifier
                            .size(40.dp)
                            .clip(RoundedCornerShape(14.dp))
                            .background(if (isDarkTheme) Color(0xFF312E81) else Color(0xFFE0E7FF)),
                        contentAlignment = Alignment.Center
                    ) {
                        Text(
                            text = "F",
                            style = TextStyle(
                                fontWeight = FontWeight.Bold,
                                color = if (isDarkTheme) Color(0xFFE0E7FF) else Color(0xFF3730A3),
                                fontSize = 18.sp
                            )
                        )
                    }

                    Box(
                        modifier = Modifier
                            .clip(CircleShape)
                            .background(if (isDarkTheme) Color(0xFF312E81).copy(alpha = 0.5f) else Color(0xFFEEF2F6))
                            .padding(horizontal = 8.dp, vertical = 2.dp)
                    ) {
                        Text(
                            text = "12/15",
                            color = if (isDarkTheme) Color(0xFFE0E7FF) else Color(0xFF3730A3),
                            fontSize = 10.sp,
                            fontWeight = FontWeight.Bold
                        )
                    }
                }

                Column {
                    Text(
                        text = "Family Vault",
                        style = MaterialTheme.typography.titleMedium.copy(
                            fontWeight = FontWeight.Bold,
                            color = MaterialTheme.colorScheme.onSurface,
                            lineHeight = 18.sp
                        )
                    )
                    Spacer(modifier = Modifier.height(2.dp))
                    Text(
                        text = "Zoya: Check doc.",
                        style = MaterialTheme.typography.bodySmall.copy(
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            fontSize = 11.sp
                        ),
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis
                    )
                }
            }
        }

        // Right Column: Calls row & Vault row
        Column(
            modifier = Modifier.weight(1f),
            verticalArrangement = Arrangement.spacedBy(10.dp)
        ) {
            // Row 1: Calls Card (Amber accent)
            Card(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(68.dp)
                    .clickable { onNavigateToCalls() },
                colors = CardDefaults.cardColors(
                    containerColor = if (isDarkTheme) Color(0xFF78350F) else Color(0xFFFFE082)
                ),
                shape = RoundedCornerShape(24.dp)
            ) {
                Row(
                    modifier = Modifier
                        .fillMaxSize()
                        .padding(horizontal = 16.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Icon(
                        imageVector = Icons.Default.Call,
                        contentDescription = "Calls",
                        tint = if (isDarkTheme) Color(0xFFFFE082) else Color(0xFF78350F),
                        modifier = Modifier.size(24.dp)
                    )
                    Spacer(modifier = Modifier.width(12.dp))
                    Column {
                        Text(
                            text = "Calls",
                            style = TextStyle(
                                fontWeight = FontWeight.Bold,
                                color = if (isDarkTheme) Color(0xFFFFE082) else Color(0xFF78350F),
                                fontSize = 14.sp
                            )
                        )
                        Text(
                            text = "3 Missed Logs",
                            style = TextStyle(
                                color = if (isDarkTheme) Color(0xFFFFE082).copy(alpha = 0.8f) else Color(0xFF78350F).copy(alpha = 0.8f),
                                fontSize = 11.sp
                            )
                        )
                    }
                }
            }

            // Row 2: Vault/Attachment Card (Sky blue accent)
            Card(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(68.dp)
                    .clickable { onOpenVaultDialog() },
                colors = CardDefaults.cardColors(
                    containerColor = if (isDarkTheme) Color(0xFF0C4A6E) else Color(0xFFE1F5FE)
                ),
                shape = RoundedCornerShape(24.dp)
            ) {
                Row(
                    modifier = Modifier
                        .fillMaxSize()
                        .padding(horizontal = 16.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Icon(
                        imageVector = Icons.Default.Attachment,
                        contentDescription = "Vault",
                        tint = if (isDarkTheme) Color(0xFFE1F5FE) else Color(0xFF0C4A6E),
                        modifier = Modifier.size(24.dp)
                    )
                    Spacer(modifier = Modifier.width(12.dp))
                    Column {
                        Text(
                            text = "Vault",
                            style = TextStyle(
                                fontWeight = FontWeight.Bold,
                                color = if (isDarkTheme) Color(0xFFE1F5FE) else Color(0xFF0C4A6E),
                                fontSize = 14.sp
                            )
                        )
                        Text(
                            text = "142 Shared Docs",
                            style = TextStyle(
                                color = if (isDarkTheme) Color(0xFFE1F5FE).copy(alpha = 0.8f) else Color(0xFF0C4A6E).copy(alpha = 0.8f),
                                fontSize = 11.sp
                            )
                        )
                    }
                }
            }
        }
    }
}

@Composable
fun BentoVaultDialog(viewModel: ChatViewModel, onDismiss: () -> Unit) {
    val isUnlocked by viewModel.isLockerUnlocked.collectAsState()
    val correctPin by viewModel.secureLockerPin.collectAsState()
    val vaultItems by viewModel.vaultItems.collectAsState()

    var pinText by remember { mutableStateOf("") }
    var errorMessage by remember { mutableStateOf<String?>(null) }
    var isChangingPinMode by remember { mutableStateOf(false) }
    var newPinInput by remember { mutableStateOf("") }

    // State for mock-adding file
    var showAddForm by remember { mutableStateOf(false) }
    var newFileName by remember { mutableStateOf("") }
    var newFileType by remember { mutableStateOf("DOCUMENT") } // DOCUMENT, IMAGE, AUDIO
    var newFileSize by remember { mutableStateOf("150 KB") }

    Dialog(
        onDismissRequest = {
            viewModel.setLockerUnlocked(false)
            onDismiss()
        },
        properties = DialogProperties(usePlatformDefaultWidth = false)
    ) {
        Card(
            modifier = Modifier
                .fillMaxWidth(0.92f)
                .wrapContentHeight()
                .padding(16.dp),
            shape = RoundedCornerShape(28.dp),
            colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
            border = BorderStroke(1.dp, MaterialTheme.colorScheme.surfaceVariant),
            elevation = CardDefaults.cardElevation(defaultElevation = 8.dp)
        ) {
            Column(
                modifier = Modifier
                    .padding(24.dp)
                    .fillMaxWidth()
            ) {
                // LOCKER HEADER
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Box(
                            modifier = Modifier
                                .size(36.dp)
                                .clip(CircleShape)
                                .background(
                                    if (isUnlocked) AccentGreen.copy(0.12f)
                                    else MaterialTheme.colorScheme.errorContainer.copy(0.4f)
                                ),
                            contentAlignment = Alignment.Center
                        ) {
                            Icon(
                                imageVector = if (isUnlocked) Icons.Default.FolderOpen else Icons.Default.Lock,
                                contentDescription = null,
                                tint = if (isUnlocked) AccentGreen else MaterialTheme.colorScheme.error,
                                modifier = Modifier.size(18.dp)
                            )
                        }
                        Spacer(modifier = Modifier.width(12.dp))
                        Text(
                            text = if (isUnlocked) "NOVA Encrypted Locker" else "NOVA High-Security Vault",
                            style = MaterialTheme.typography.titleMedium.copy(
                                fontWeight = FontWeight.Bold,
                                color = MaterialTheme.colorScheme.onSurface
                            )
                        )
                    }
                    IconButton(onClick = {
                        viewModel.setLockerUnlocked(false)
                        onDismiss()
                    }) {
                        Icon(Icons.Default.Close, contentDescription = "Close", tint = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                }

                Spacer(modifier = Modifier.height(16.dp))

                if (!isUnlocked) {
                    // PIN CODE LOCK SCREEN
                    Column(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalAlignment = Alignment.CenterHorizontally
                    ) {
                        Text(
                            text = if (isChangingPinMode) "Configure Security Code" else "ENTER SECURITY PIN TO DECRYPT",
                            style = MaterialTheme.typography.labelSmall.copy(
                                fontWeight = FontWeight.Black,
                                color = MaterialTheme.colorScheme.primary,
                                letterSpacing = 1.5.sp
                            ),
                            textAlign = TextAlign.Center
                        )
                        Spacer(modifier = Modifier.height(8.dp))
                        Text(
                            text = if (isChangingPinMode) "Choose a 4-digit code to seal your documents." else "All vault assets are sealed on-device using military-grade key algorithms.",
                            style = MaterialTheme.typography.bodySmall.copy(
                                color = MaterialTheme.colorScheme.onSurfaceVariant
                            ),
                            textAlign = TextAlign.Center,
                            modifier = Modifier.padding(horizontal = 16.dp)
                        )

                        Spacer(modifier = Modifier.height(24.dp))

                        // Selected PIN Indicator Dots
                        val currentActivePin = if (isChangingPinMode) newPinInput else pinText
                        Row(
                            horizontalArrangement = Arrangement.spacedBy(16.dp),
                            modifier = Modifier.padding(vertical = 12.dp)
                        ) {
                            for (i in 0..3) {
                                val hasDigit = currentActivePin.length > i
                                Box(
                                    modifier = Modifier
                                        .size(18.dp)
                                        .clip(CircleShape)
                                        .background(
                                            if (hasDigit) {
                                                if (errorMessage != null) Color.Red else AccentGreen
                                            } else {
                                                MaterialTheme.colorScheme.surfaceVariant
                                            }
                                        )
                                        .border(
                                            1.5.dp,
                                            if (hasDigit) Color.Transparent else MaterialTheme.colorScheme.outline.copy(alpha = 0.5f),
                                            CircleShape
                                        )
                                )
                            }
                        }

                        // Error notification section
                        Box(modifier = Modifier.height(24.dp)) {
                            if (errorMessage != null) {
                                Text(
                                    text = errorMessage!!,
                                    color = Color.Red,
                                    fontSize = 12.sp,
                                    fontWeight = FontWeight.Bold,
                                    textAlign = TextAlign.Center
                                )
                            } else if (isChangingPinMode) {
                                Text(
                                    text = "Current registered PIN is $correctPin",
                                    color = MaterialTheme.colorScheme.outline,
                                    fontSize = 11.sp,
                                    textAlign = TextAlign.Center
                                )
                            }
                        }

                        Spacer(modifier = Modifier.height(16.dp))

                        // Custom SNAPPY Numeric Keypad Grid
                        val keys = listOf(
                            listOf("1", "2", "3"),
                            listOf("4", "5", "6"),
                            listOf("7", "8", "9"),
                            listOf("Clear", "0", "OK")
                        )

                        Column(
                            verticalArrangement = Arrangement.spacedBy(12.dp),
                            modifier = Modifier.padding(horizontal = 10.dp)
                        ) {
                            keys.forEach { rowKeys ->
                                Row(
                                    modifier = Modifier.fillMaxWidth(),
                                    horizontalArrangement = Arrangement.spacedBy(12.dp)
                                ) {
                                    rowKeys.forEach { key ->
                                        // Keypad circular button matching modern bento
                                        Box(
                                            modifier = Modifier
                                                .weight(1f)
                                                .aspectRatio(1.85f)
                                                .clip(RoundedCornerShape(16.dp))
                                                .background(
                                                    when (key) {
                                                        "OK" -> AccentGreen
                                                        "Clear" -> MaterialTheme.colorScheme.surfaceVariant
                                                        else -> MaterialTheme.colorScheme.surfaceVariant.copy(0.4f)
                                                    }
                                                )
                                                .border(
                                                    1.dp,
                                                    MaterialTheme.colorScheme.surfaceVariant,
                                                    RoundedCornerShape(16.dp)
                                                )
                                                .clickable {
                                                    errorMessage = null
                                                    if (isChangingPinMode) {
                                                        // Configure PIN Flow
                                                        when (key) {
                                                            "Clear" -> {
                                                                if (newPinInput.isNotEmpty()) newPinInput = newPinInput.dropLast(1)
                                                            }
                                                            "OK" -> {
                                                                if (newPinInput.length == 4) {
                                                                    viewModel.updateLockerPin(newPinInput)
                                                                    isChangingPinMode = false
                                                                    errorMessage = "PIN updated successfully to $newPinInput!"
                                                                    newPinInput = ""
                                                                } else {
                                                                    errorMessage = "PIN must be exactly 4 digits!"
                                                                }
                                                            }
                                                            else -> {
                                                                if (newPinInput.length < 4) {
                                                                    newPinInput += key
                                                                }
                                                            }
                                                        }
                                                    } else {
                                                        // Regular Login Flow
                                                        when (key) {
                                                            "Clear" -> {
                                                                if (pinText.isNotEmpty()) pinText = pinText.dropLast(1)
                                                            }
                                                            "OK" -> {
                                                                if (pinText == correctPin) {
                                                                    viewModel.setLockerUnlocked(true)
                                                                    pinText = ""
                                                                } else {
                                                                    errorMessage = "ACCESS DENIED • INCORRECT PIN!"
                                                                    pinText = ""
                                                                }
                                                            }
                                                            else -> {
                                                                if (pinText.length < 4) {
                                                                    pinText += key
                                                                    // Automatic submit on 4th digit for snappy experience
                                                                    if (pinText.length == 4) {
                                                                        if (pinText == correctPin) {
                                                                            viewModel.setLockerUnlocked(true)
                                                                            pinText = ""
                                                                        } else {
                                                                            errorMessage = "ACCESS DENIED • INCORRECT PIN!"
                                                                            pinText = ""
                                                                        }
                                                                    }
                                                                }
                                                            }
                                                        }
                                                    }
                                                },
                                            contentAlignment = Alignment.Center
                                        ) {
                                            Text(
                                                text = key,
                                                style = MaterialTheme.typography.bodyMedium.copy(
                                                    fontWeight = FontWeight.Bold,
                                                    color = when (key) {
                                                        "OK" -> Color.Black
                                                        else -> MaterialTheme.colorScheme.onSurface
                                                    }
                                                )
                                            )
                                        }
                                    }
                                }
                            }
                        }

                        Spacer(modifier = Modifier.height(20.dp))

                        // Option to toggle PIN setup mode
                        TextButton(
                            onClick = {
                                isChangingPinMode = !isChangingPinMode
                                errorMessage = null
                                pinText = ""
                                newPinInput = ""
                            }
                        ) {
                            Text(
                                text = if (isChangingPinMode) "Back to Unlock" else "Change Encryption PIN",
                                style = MaterialTheme.typography.bodyMedium.copy(
                                    fontWeight = FontWeight.Bold,
                                    color = MaterialTheme.colorScheme.primary
                                )
                            )
                        }
                    }
                } else {
                    // UNLOCKED VIEW: FILE VAULT DISPLAY
                    if (!showAddForm) {
                        Text(
                            text = "End-to-end encrypted files shared within your 15-member private loop. All content is protected with local military-grade AES-256.",
                            style = MaterialTheme.typography.bodySmall.copy(
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                                lineHeight = 16.sp
                            )
                        )

                        Spacer(modifier = Modifier.height(16.dp))

                        // Vault files list with nice spacing
                        Column(
                            verticalArrangement = Arrangement.spacedBy(10.dp),
                            modifier = Modifier
                                .fillMaxWidth()
                                .heightIn(max = 280.dp)
                                .verticalScroll(rememberScrollState())
                        ) {
                            vaultItems.forEach { item ->
                                val icon = when (item.type) {
                                    "IMAGE" -> Icons.Default.Image
                                    else -> Icons.Default.Description
                                }

                                Row(
                                    modifier = Modifier
                                        .fillMaxWidth()
                                        .clip(RoundedCornerShape(16.dp))
                                        .background(MaterialTheme.colorScheme.background)
                                        .border(1.dp, MaterialTheme.colorScheme.surfaceVariant, RoundedCornerShape(16.dp))
                                        .padding(12.dp),
                                    verticalAlignment = Alignment.CenterVertically
                                ) {
                                    Box(
                                        modifier = Modifier
                                            .size(40.dp)
                                            .clip(RoundedCornerShape(10.dp))
                                            .background(MaterialTheme.colorScheme.surface),
                                        contentAlignment = Alignment.Center
                                    ) {
                                        Icon(
                                            imageVector = icon,
                                            contentDescription = null,
                                            tint = MaterialTheme.colorScheme.primary,
                                            modifier = Modifier.size(20.dp)
                                        )
                                    }
                                    Spacer(modifier = Modifier.width(12.dp))
                                    Column(
                                        modifier = Modifier.weight(1f)
                                    ) {
                                        Text(
                                            text = item.name,
                                            style = MaterialTheme.typography.bodyMedium.copy(
                                                fontWeight = FontWeight.Bold,
                                                color = MaterialTheme.colorScheme.onSurface
                                            ),
                                            maxLines = 1,
                                            overflow = TextOverflow.Ellipsis
                                        )
                                        Row(verticalAlignment = Alignment.CenterVertically) {
                                            Text(
                                                text = item.details,
                                                style = MaterialTheme.typography.bodySmall.copy(
                                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                                    fontSize = 11.sp
                                                )
                                            )
                                            Spacer(modifier = Modifier.width(8.dp))
                                            Box(
                                                modifier = Modifier
                                                    .clip(RoundedCornerShape(4.dp))
                                                    .background(AccentGreen.copy(0.12f))
                                                    .padding(horizontal = 4.dp, vertical = 2.dp)
                                            ) {
                                                Text(
                                                    text = item.securityStatus,
                                                    color = AccentGreen,
                                                    fontSize = 9.sp,
                                                    fontWeight = FontWeight.Bold
                                                )
                                            }
                                        }
                                    }
                                    IconButton(onClick = { /* Simulated download secure */ }) {
                                        Icon(Icons.Default.ArrowDownward, contentDescription = "Download Securely", tint = AccentGreen)
                                    }
                                }
                            }
                        }

                        Spacer(modifier = Modifier.height(16.dp))

                        Row(
                            horizontalArrangement = Arrangement.spacedBy(8.dp),
                            modifier = Modifier.fillMaxWidth()
                        ) {
                            // Add Encrypted File button
                            OutlinedButton(
                                onClick = { showAddForm = true },
                                modifier = Modifier.weight(1f),
                                shape = RoundedCornerShape(12.dp),
                                border = BorderStroke(1.dp, MaterialTheme.colorScheme.primary)
                            ) {
                                Icon(Icons.Default.Add, contentDescription = null, modifier = Modifier.size(16.dp))
                                Spacer(modifier = Modifier.width(6.dp))
                                Text("Encrypt File", fontWeight = FontWeight.Bold)
                            }

                            Button(
                                onClick = {
                                    viewModel.setLockerUnlocked(false)
                                    onDismiss()
                                },
                                modifier = Modifier.weight(1f),
                                shape = RoundedCornerShape(12.dp),
                                colors = ButtonDefaults.buttonColors(containerColor = MaterialTheme.colorScheme.primary)
                            ) {
                                Text("Close Locker", color = MaterialTheme.colorScheme.onPrimary, fontWeight = FontWeight.Bold)
                            }
                        }
                    } else {
                        // ADD SECURE FILE FORM
                        Column(modifier = Modifier.fillMaxWidth()) {
                            Text(
                                text = "Encrypt and Seal New Document",
                                style = MaterialTheme.typography.titleSmall.copy(
                                    fontWeight = FontWeight.Bold,
                                    color = MaterialTheme.colorScheme.primary
                                )
                            )
                            Spacer(modifier = Modifier.height(12.dp))

                            OutlinedTextField(
                                value = newFileName,
                                onValueChange = { newFileName = it },
                                label = { Text("Document Name", color = MaterialTheme.colorScheme.onSurface) },
                                placeholder = { Text("e.g. My_Passwords.txt") },
                                singleLine = true,
                                modifier = Modifier.fillMaxWidth(),
                                colors = OutlinedTextFieldDefaults.colors(
                                    focusedBorderColor = MaterialTheme.colorScheme.primary,
                                    focusedLabelColor = MaterialTheme.colorScheme.primary,
                                    focusedTextColor = MaterialTheme.colorScheme.onSurface,
                                    unfocusedTextColor = MaterialTheme.colorScheme.onSurface
                                )
                            )

                            Spacer(modifier = Modifier.height(12.dp))

                            // Type Selection
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.spacedBy(8.dp)
                            ) {
                                listOf("DOCUMENT", "IMAGE").forEach { type ->
                                    val isSelected = newFileType == type
                                    Box(
                                        modifier = Modifier
                                            .weight(1f)
                                            .clip(RoundedCornerShape(8.dp))
                                            .background(
                                                if (isSelected) MaterialTheme.colorScheme.primaryContainer
                                                else MaterialTheme.colorScheme.surfaceVariant.copy(0.4f)
                                            )
                                            .border(
                                                1.dp,
                                                if (isSelected) MaterialTheme.colorScheme.primary else Color.Transparent,
                                                RoundedCornerShape(8.dp)
                                            )
                                            .clickable { newFileType = type }
                                            .padding(vertical = 10.dp),
                                        contentAlignment = Alignment.Center
                                    ) {
                                        Text(
                                            text = type,
                                            fontSize = 11.sp,
                                            fontWeight = FontWeight.Bold,
                                            color = if (isSelected) MaterialTheme.colorScheme.onPrimaryContainer else MaterialTheme.colorScheme.onSurfaceVariant
                                        )
                                    }
                                }
                            }

                            Spacer(modifier = Modifier.height(12.dp))

                            OutlinedTextField(
                                value = newFileSize,
                                onValueChange = { newFileSize = it },
                                label = { Text("Simulated Size", color = MaterialTheme.colorScheme.onSurface) },
                                singleLine = true,
                                modifier = Modifier.fillMaxWidth(),
                                colors = OutlinedTextFieldDefaults.colors(
                                    focusedBorderColor = MaterialTheme.colorScheme.primary,
                                    focusedLabelColor = MaterialTheme.colorScheme.primary,
                                    focusedTextColor = MaterialTheme.colorScheme.onSurface,
                                    unfocusedTextColor = MaterialTheme.colorScheme.onSurface
                                )
                            )

                            Spacer(modifier = Modifier.height(16.dp))

                            Row(
                                horizontalArrangement = Arrangement.spacedBy(8.dp),
                                modifier = Modifier.fillMaxWidth()
                            ) {
                                TextButton(
                                    onClick = { showAddForm = false },
                                    modifier = Modifier.weight(1f)
                                ) {
                                    Text("Cancel", fontWeight = FontWeight.Bold)
                                }

                                Button(
                                    onClick = {
                                        if (newFileName.isNotBlank()) {
                                            viewModel.addVaultItem(newFileName, newFileSize, newFileType)
                                            newFileName = ""
                                            showAddForm = false
                                        }
                                    },
                                    modifier = Modifier.weight(1f),
                                    shape = RoundedCornerShape(12.dp),
                                    colors = ButtonDefaults.buttonColors(containerColor = MaterialTheme.colorScheme.primary)
                                ) {
                                    Text("Encrypt & Add", color = MaterialTheme.colorScheme.onPrimary, fontWeight = FontWeight.Bold)
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}

// --- MAIN BENTO-DASHBOARD ---
@Composable
fun MainDashboardScreen(
    viewModel: ChatViewModel,
    isDarkTheme: Boolean = false,
    onToggleDarkTheme: () -> Unit = {}
) {
    val myUsername by viewModel.myUsername.collectAsState()
    val allChats by viewModel.allChats.collectAsState()
    val allCallLogs by viewModel.allCallLogs.collectAsState()
    val allUsers by viewModel.allUsers.collectAsState()

    var searchQuery by remember { mutableStateOf("") }
    var isSearching by remember { mutableStateOf(false) }
    var showLogoutConfirmDialog by remember { mutableStateOf(false) }

    // 4 WhatsApp bottom tabs:
    // 0 = CHATS, 1 = GROUPS, 2 = CALLS, 3 = STATUS
    var activeTab by remember { mutableIntStateOf(0) }

    Scaffold(
        topBar = {
            Column(
                modifier = Modifier
                    .background(MaterialTheme.colorScheme.background)
                    .windowInsetsPadding(WindowInsets.statusBars)
            ) {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(64.dp)
                        .padding(horizontal = 16.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.SpaceBetween
                ) {
                    if (isSearching) {
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .height(48.dp)
                                .background(MaterialTheme.colorScheme.surfaceVariant, RoundedCornerShape(24.dp))
                                .padding(horizontal = 12.dp, vertical = 4.dp),
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            IconButton(onClick = {
                                isSearching = false
                                searchQuery = ""
                            }) {
                                Icon(Icons.Default.ArrowBack, contentDescription = "Back", tint = MaterialTheme.colorScheme.onSurface)
                            }
                            TextField(
                                value = searchQuery,
                                onValueChange = { searchQuery = it },
                                placeholder = { Text("Search private contacts...", color = MaterialTheme.colorScheme.onSurfaceVariant.copy(0.6f)) },
                                colors = TextFieldDefaults.colors(
                                    focusedContainerColor = Color.Transparent,
                                    unfocusedContainerColor = Color.Transparent,
                                    disabledContainerColor = Color.Transparent,
                                    focusedIndicatorColor = Color.Transparent,
                                    unfocusedIndicatorColor = Color.Transparent,
                                    focusedTextColor = MaterialTheme.colorScheme.onSurface,
                                    unfocusedTextColor = MaterialTheme.colorScheme.onSurface
                                ),
                                singleLine = true,
                                modifier = Modifier.weight(1f)
                            )
                        }
                    } else {
                        // Clean Title matched exactly with the E2EE green icon for space-efficient premium look
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            modifier = Modifier.padding(start = 2.dp)
                        ) {
                            Text(
                                text = "NOVA",
                                style = MaterialTheme.typography.titleLarge.copy(
                                    fontWeight = FontWeight.Black,
                                    color = MaterialTheme.colorScheme.primary,
                                    letterSpacing = 1.sp
                                )
                            )
                            Spacer(modifier = Modifier.width(6.dp))
                            Icon(
                                imageVector = Icons.Default.VerifiedUser,
                                contentDescription = "E2EE Secure Endpoint Active",
                                tint = AccentGreen,
                                modifier = Modifier.size(16.dp)
                            )
                        }

                        // Compact, styled action buttons preventing any overlap
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(6.dp)
                        ) {
                            // 1. Compact Search Action Button
                            IconButton(
                                onClick = { isSearching = true },
                                modifier = Modifier
                                    .size(34.dp)
                                    .clip(CircleShape)
                                    .background(MaterialTheme.colorScheme.surface.copy(alpha = 0.5f))
                                    .border(1.dp, MaterialTheme.colorScheme.surfaceVariant, CircleShape)
                            ) {
                                Icon(
                                    imageVector = Icons.Default.Search,
                                    contentDescription = "Search Contacts",
                                    tint = MaterialTheme.colorScheme.onSurface,
                                    modifier = Modifier.size(16.dp)
                                )
                            }

                            // 2. Direct ChatGPT Shortcut Action with premium styling
                            IconButton(
                                onClick = { viewModel.setActiveChat("chatgpt") },
                                modifier = Modifier
                                    .size(34.dp)
                                    .clip(CircleShape)
                                    .background(MaterialTheme.colorScheme.primary.copy(alpha = 0.12f))
                                    .border(1.dp, MaterialTheme.colorScheme.primary.copy(alpha = 0.35f), CircleShape)
                            ) {
                                Icon(
                                    imageVector = Icons.Default.AutoAwesome,
                                    contentDescription = "Ask secure ChatGPT AI",
                                    tint = MaterialTheme.colorScheme.primary,
                                    modifier = Modifier.size(16.dp)
                                )
                            }

                            // 3. Compact Theme Switch
                            IconButton(
                                onClick = { onToggleDarkTheme() },
                                modifier = Modifier
                                    .size(34.dp)
                                    .clip(CircleShape)
                                    .background(MaterialTheme.colorScheme.surface.copy(alpha = 0.5f))
                                    .border(1.dp, MaterialTheme.colorScheme.surfaceVariant, CircleShape)
                            ) {
                                Icon(
                                    imageVector = Icons.Default.Palette,
                                    contentDescription = "Toggle Theme Mode",
                                    tint = MaterialTheme.colorScheme.primary,
                                    modifier = Modifier.size(16.dp)
                                )
                            }

                            // 4. Secure Red Highlighted End-to-End Logout
                            IconButton(
                                onClick = { showLogoutConfirmDialog = true },
                                modifier = Modifier
                                    .size(34.dp)
                                    .clip(CircleShape)
                                    .background(Color(0xFFEF5350).copy(alpha = 0.12f))
                                    .border(1.dp, Color(0xFFEF5350).copy(alpha = 0.35f), CircleShape)
                            ) {
                                Icon(
                                    imageVector = Icons.Default.Logout,
                                    contentDescription = "Secure Logout",
                                    tint = Color(0xFFEF5350),
                                    modifier = Modifier.size(16.dp)
                                )
                            }
                        }
                    }
                }
            }
        },
        floatingActionButton = {
            if (activeTab == 0) {
                ExtendedFloatingActionButton(
                    onClick = { viewModel.setActiveChat("chatgpt") },
                    containerColor = MaterialTheme.colorScheme.primary,
                    contentColor = MaterialTheme.colorScheme.onPrimary,
                    elevation = FloatingActionButtonDefaults.elevation(defaultElevation = 6.dp),
                    shape = RoundedCornerShape(16.dp),
                    modifier = Modifier.padding(bottom = 16.dp, end = 8.dp)
                ) {
                    Icon(
                        imageVector = Icons.Default.AutoAwesome,
                        tint = MaterialTheme.colorScheme.onPrimary,
                        contentDescription = "Ask ChatGPT secure AI",
                        modifier = Modifier.size(18.dp)
                    )
                    Spacer(modifier = Modifier.width(8.dp))
                    Text("Chat with ChatGPT AI 🤖", fontWeight = FontWeight.Bold, fontSize = 12.sp)
                }
            }
        },
        bottomBar = {
            // Authentic Sticky Custom Navigation Bar with bento dynamic selections
            NavigationBar(
                containerColor = MaterialTheme.colorScheme.surface,
                modifier = Modifier.windowInsetsPadding(WindowInsets.navigationBars)
            ) {
                // Chats Tab
                NavigationBarItem(
                    selected = activeTab == 0,
                    onClick = { activeTab = 0 },
                    icon = {
                        val unreadCount = allChats.filter { !it.isGroup }.sumOf { it.unreadCount }
                        BadgedBox(badge = {
                            if (unreadCount > 0) {
                                Badge(containerColor = AccentGreen) {
                                    Text(unreadCount.toString(), color = Color.Black, fontWeight = FontWeight.Bold)
                                }
                            }
                        }) {
                            Icon(
                                imageVector = if (activeTab == 0) Icons.Filled.Chat else Icons.Outlined.Chat,
                                contentDescription = "Solo Chats"
                            )
                        }
                    },
                    label = { Text("Chats", fontWeight = FontWeight.Bold) },
                    colors = NavigationBarItemDefaults.colors(
                        selectedIconColor = MaterialTheme.colorScheme.onPrimaryContainer,
                        selectedTextColor = MaterialTheme.colorScheme.primary,
                        unselectedIconColor = MaterialTheme.colorScheme.onSurfaceVariant,
                        unselectedTextColor = MaterialTheme.colorScheme.onSurfaceVariant,
                        indicatorColor = MaterialTheme.colorScheme.primaryContainer
                    )
                )

                // Groups Tab
                NavigationBarItem(
                    selected = activeTab == 1,
                    onClick = { activeTab = 1 },
                    icon = {
                        val groupUnread = allChats.filter { it.isGroup }.sumOf { it.unreadCount }
                        BadgedBox(badge = {
                            if (groupUnread > 0) {
                                Badge(containerColor = AccentGreen) {
                                    Text(groupUnread.toString(), color = Color.Black, fontWeight = FontWeight.Bold)
                                }
                            }
                        }) {
                            Icon(
                                imageVector = if (activeTab == 1) Icons.Filled.Groups else Icons.Outlined.Groups,
                                contentDescription = "Groups"
                            )
                        }
                    },
                    label = { Text("Groups", fontWeight = FontWeight.Bold) },
                    colors = NavigationBarItemDefaults.colors(
                        selectedIconColor = MaterialTheme.colorScheme.onPrimaryContainer,
                        selectedTextColor = MaterialTheme.colorScheme.primary,
                        unselectedIconColor = MaterialTheme.colorScheme.onSurfaceVariant,
                        unselectedTextColor = MaterialTheme.colorScheme.onSurfaceVariant,
                        indicatorColor = MaterialTheme.colorScheme.primaryContainer
                    )
                )

                // Status Tab
                NavigationBarItem(
                    selected = activeTab == 3,
                    onClick = { activeTab = 3 },
                    icon = {
                        Icon(
                            imageVector = if (activeTab == 3) Icons.Filled.FilterTiltShift else Icons.Outlined.FilterTiltShift,
                            contentDescription = "Status"
                        )
                    },
                    label = { Text("Status", fontWeight = FontWeight.Bold) },
                    colors = NavigationBarItemDefaults.colors(
                        selectedIconColor = MaterialTheme.colorScheme.onPrimaryContainer,
                        selectedTextColor = MaterialTheme.colorScheme.primary,
                        unselectedIconColor = MaterialTheme.colorScheme.onSurfaceVariant,
                        unselectedTextColor = MaterialTheme.colorScheme.onSurfaceVariant,
                        indicatorColor = MaterialTheme.colorScheme.primaryContainer
                    )
                )

                // Calls Tab
                NavigationBarItem(
                    selected = activeTab == 2,
                    onClick = { activeTab = 2 },
                    icon = {
                        Icon(
                            imageVector = if (activeTab == 2) Icons.Filled.Call else Icons.Outlined.Call,
                            contentDescription = "Calls"
                        )
                    },
                    label = { Text("Calls", fontWeight = FontWeight.Bold) },
                    colors = NavigationBarItemDefaults.colors(
                        selectedIconColor = MaterialTheme.colorScheme.onPrimaryContainer,
                        selectedTextColor = MaterialTheme.colorScheme.primary,
                        unselectedIconColor = MaterialTheme.colorScheme.onSurfaceVariant,
                        unselectedTextColor = MaterialTheme.colorScheme.onSurfaceVariant,
                        indicatorColor = MaterialTheme.colorScheme.primaryContainer
                    )
                )
            }
        },
        containerColor = MaterialTheme.colorScheme.background
    ) { innerPadding ->
        Box(
            modifier = Modifier
                .fillMaxSize()
                .padding(innerPadding)
        ) {
            when (activeTab) {
                0 -> { // Chats Tab
                    val soloChats = allChats.filter { !it.isGroup && it.id != "chatgpt" && (searchQuery.isEmpty() || it.name.contains(searchQuery, ignoreCase = true)) }
                    var showVaultDialog by remember { mutableStateOf(false) }

                    if (showVaultDialog) {
                        BentoVaultDialog(viewModel = viewModel, onDismiss = { showVaultDialog = false })
                    }

                    if (soloChats.isEmpty() && searchQuery.isNotEmpty()) {
                        var showAddContactDialog by remember { mutableStateOf(false) }
                        var newContactEmail by remember { mutableStateOf("") }
                        
                        Column(
                            modifier = Modifier
                                .fillMaxSize()
                                .padding(24.dp),
                            horizontalAlignment = Alignment.CenterHorizontally,
                            verticalArrangement = Arrangement.Center
                        ) {
                            Icon(
                                imageVector = Icons.Default.ConnectWithoutContact,
                                contentDescription = null,
                                tint = MaterialTheme.colorScheme.primary.copy(alpha = 0.5f),
                                modifier = Modifier.size(72.dp)
                            )
                            Spacer(modifier = Modifier.height(16.dp))
                            Text(
                                text = "Zero Active E2EE Nodes found for \"$searchQuery\"",
                                style = MaterialTheme.typography.bodyLarge.copy(fontWeight = FontWeight.SemiBold),
                                textAlign = TextAlign.Center
                            )
                            Text(
                                text = "Initialize private cryptographic chat slots with another user node by register binding their login details here.",
                                style = MaterialTheme.typography.bodySmall.copy(color = MaterialTheme.colorScheme.onSurfaceVariant),
                                textAlign = TextAlign.Center,
                                modifier = Modifier.padding(top = 8.dp, bottom = 24.dp)
                            )
                            Button(
                                onClick = { showAddContactDialog = true },
                                shape = RoundedCornerShape(16.dp),
                                colors = ButtonDefaults.buttonColors(containerColor = MaterialTheme.colorScheme.primary),
                                modifier = Modifier.height(48.dp)
                            ) {
                                Row(verticalAlignment = Alignment.CenterVertically) {
                                    Icon(Icons.Default.Add, contentDescription = null)
                                    Spacer(modifier = Modifier.width(8.dp))
                                    Text("Register secure node for \"$searchQuery\"")
                                }
                            }
                        }

                        if (showAddContactDialog) {
                            AlertDialog(
                                onDismissRequest = { showAddContactDialog = false },
                                title = {
                                    Text(
                                        "Setup Direct E2EE Node",
                                        fontWeight = FontWeight.Bold,
                                        style = MaterialTheme.typography.titleMedium
                                    )
                                },
                                text = {
                                    Column {
                                        Text(
                                            "Establish an authenticated direct ratchet space with this user on your local workspace system.",
                                            style = MaterialTheme.typography.bodySmall,
                                            modifier = Modifier.padding(bottom = 16.dp)
                                        )
                                        OutlinedTextField(
                                            value = searchQuery,
                                            onValueChange = {},
                                            label = { Text("Display Name") },
                                            enabled = false,
                                            modifier = Modifier.fillMaxWidth(),
                                            colors = OutlinedTextFieldDefaults.colors(
                                                disabledBorderColor = MaterialTheme.colorScheme.surfaceVariant,
                                                disabledTextColor = MaterialTheme.colorScheme.onSurface
                                            )
                                        )
                                        Spacer(modifier = Modifier.height(12.dp))
                                        OutlinedTextField(
                                            value = newContactEmail,
                                            onValueChange = { newContactEmail = it },
                                            label = { Text("Private Email Address") },
                                            placeholder = { Text("e.g. user@protonmail.com") },
                                            modifier = Modifier.fillMaxWidth(),
                                            singleLine = true,
                                            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email)
                                        )
                                    }
                                },
                                confirmButton = {
                                    Button(
                                        onClick = {
                                            if (newContactEmail.trim().isNotEmpty()) {
                                                viewModel.createCustomContact(searchQuery.trim(), newContactEmail.trim())
                                                showAddContactDialog = false
                                                searchQuery = "" // Reset search to show our new contact
                                            }
                                        },
                                        colors = ButtonDefaults.buttonColors(containerColor = MaterialTheme.colorScheme.primary)
                                    ) {
                                        Text("Bind Security Keys")
                                    }
                                },
                                dismissButton = {
                                    TextButton(onClick = { showAddContactDialog = false }) {
                                        Text("Cancel")
                                    }
                                },
                                shape = RoundedCornerShape(24.dp)
                            )
                        }
                    } else {
                        LazyColumn(modifier = Modifier.fillMaxSize()) {
                            item { BentoSecureBanner() }
                            item {
                                BentoFeaturedGroupsGrid(
                                    isDarkTheme = isDarkTheme,
                                    onNavigateToCalls = { activeTab = 2 },
                                    onOpenVaultDialog = { showVaultDialog = true },
                                    onOpenGroupChat = {
                                        val firstGroup = allChats.firstOrNull { it.isGroup }
                                        if (firstGroup != null) {
                                            viewModel.setActiveChat(firstGroup.id)
                                        } else {
                                            activeTab = 1
                                        }
                                    }
                                )
                            }
                            
                            // Pinned Elite Secure AI Companion (ChatGPT)
                            item {
                                PinnedAIChatItemView {
                                    viewModel.setActiveChat("chatgpt")
                                }
                            }

                            item {
                                Text(
                                    text = "Secure Personal Chats",
                                    style = TextStyle(
                                        fontWeight = FontWeight.Bold,
                                        fontSize = 15.sp,
                                        color = MaterialTheme.colorScheme.primary
                                    ),
                                    modifier = Modifier.padding(horizontal = 16.dp, vertical = 8.dp)
                                )
                            }
                            items(soloChats, key = { it.id }) { chat ->
                                ChatItemView(chat = chat, iconColor = 0xFF4CAF50) {
                                    viewModel.setActiveChat(chat.id)
                                }
                            }
                        }
                    }
                }
                1 -> { // Groups Tab
                    val groupChats = allChats.filter { it.isGroup && (searchQuery.isEmpty() || it.name.contains(searchQuery, ignoreCase = true)) }
                    LazyColumn(modifier = Modifier.fillMaxSize()) {
                        item { GroupAuthorizedBanner() }
                        items(groupChats, key = { it.id }) { chat ->
                            ChatItemView(chat = chat, iconColor = 0xFF00bcd4, isGroup = true) {
                                viewModel.setActiveChat(chat.id)
                            }
                        }
                    }
                }
                2 -> { // Calls Tab
                    if (allCallLogs.isEmpty()) {
                        EmptyListState(message = "No voice or video calling records.", icon = Icons.Default.PhoneCallback)
                    } else {
                        LazyColumn(modifier = Modifier.fillMaxSize()) {
                            items(allCallLogs) { log ->
                                CallLogItemView(log = log) {
                                    // Trigger call back
                                    val contact = allUsers.firstOrNull { it.id == log.contactId }
                                    if (contact != null) {
                                        viewModel.initiateOutgoingCall(contact, log.isVideo)
                                    }
                                }
                            }
                        }
                    }
                }
                3 -> { // Status (WhatsApp Stories) Tab
                    StatusTabContent(viewModel = viewModel, allUsers = allUsers)
                }
            }
        }
        
        // --- Secure Logout Confirmation Dialog ---
        if (showLogoutConfirmDialog) {
            AlertDialog(
                onDismissRequest = { showLogoutConfirmDialog = false },
                title = {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Icon(
                            imageVector = Icons.Default.Lock,
                            tint = Color(0xFFEF5350),
                            modifier = Modifier.size(24.dp),
                            contentDescription = null
                        )
                        Spacer(modifier = Modifier.width(8.dp))
                        Text(
                            text = "Secure Logout Profile",
                            style = MaterialTheme.typography.titleMedium,
                            fontWeight = FontWeight.Bold,
                            color = MaterialTheme.colorScheme.onSurface
                        )
                    }
                },
                text = {
                    Text(
                        text = "Are you sure you want to end your secure session? This action will safely lock the node, purge cache arrays, and zero-wipe temporary local workspaces.",
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                },
                confirmButton = {
                    Button(
                        onClick = {
                            showLogoutConfirmDialog = false
                            viewModel.logout()
                        },
                        colors = ButtonDefaults.buttonColors(containerColor = Color(0xFFEF5350))
                    ) {
                        Text("Log Out Node", color = Color.White, fontWeight = FontWeight.Bold)
                    }
                },
                dismissButton = {
                    TextButton(
                        onClick = { showLogoutConfirmDialog = false }
                    ) {
                        Text("Cancel", fontWeight = FontWeight.Bold)
                    }
                },
                shape = RoundedCornerShape(28.dp),
                containerColor = MaterialTheme.colorScheme.surface,
                tonalElevation = 6.dp
            )
        }
    }
}

// --- BANNER NOTICES FOR SECURITY PROTOCOLS ---
@Composable
fun E2EENoticeBanner() {
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .padding(14.dp),
        colors = CardDefaults.cardColors(containerColor = DarkSurface.copy(alpha = 0.5f)),
        shape = RoundedCornerShape(12.dp)
    ) {
        Row(
            modifier = Modifier.padding(14.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Icon(
                imageVector = Icons.Default.Lock,
                contentDescription = null,
                tint = AccentGreen,
                modifier = Modifier.size(20.dp)
            )
            Spacer(modifier = Modifier.width(12.dp))
            Text(
                text = "Personal messages are cryptographically sealed end-to-end. Your physical keys are generated locally.",
                style = MaterialTheme.typography.bodySmall.copy(
                    color = TextMuted,
                    lineHeight = 16.sp
                )
            )
        }
    }
}

@Composable
fun GroupAuthorizedBanner() {
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .padding(14.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.primaryContainer.copy(alpha = 0.2f)),
        shape = RoundedCornerShape(24.dp),
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.primary.copy(alpha = 0.2f))
    ) {
        Column(
            modifier = Modifier.padding(16.dp)
        ) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(
                    imageVector = Icons.Default.Security,
                    contentDescription = null,
                    tint = MaterialTheme.colorScheme.primary,
                    modifier = Modifier.size(20.dp)
                )
                Spacer(modifier = Modifier.width(8.dp))
                Text(
                    text = "Strict Private Member Policy",
                    style = MaterialTheme.typography.bodyMedium.copy(
                        color = MaterialTheme.colorScheme.onSurface,
                        fontWeight = FontWeight.Bold
                    )
                )
            }
            Spacer(modifier = Modifier.height(6.dp))
            Text(
                text = "Our database maintains a strict 15-member total registration cap. Group messages are automatically processed and verified. Zero uninvited callers allowed.",
                style = MaterialTheme.typography.bodySmall.copy(
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    lineHeight = 16.sp
                )
            )
        }
    }
}

// --- PINNED AI COMPANION (CHATGPT/GEMINI) ITEM VIEW ---
@Composable
fun PinnedAIChatItemView(
    onClick: () -> Unit
) {
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 14.dp, vertical = 6.dp)
            .clickable { onClick() },
        shape = RoundedCornerShape(24.dp),
        colors = CardDefaults.cardColors(
            containerColor = MaterialTheme.colorScheme.primaryContainer.copy(alpha = 0.22f)
        ),
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.primary.copy(alpha = 0.25f)),
        elevation = CardDefaults.cardElevation(defaultElevation = 1.dp)
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(14.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Box(
                modifier = Modifier
                    .size(46.dp)
                    .clip(CircleShape)
                    .background(
                        brush = androidx.compose.ui.graphics.Brush.linearGradient(
                            colors = listOf(Color(0xFF00F2FE), Color(0xFF5F5AF6))
                        )
                    ),
                contentAlignment = Alignment.Center
            ) {
                Icon(
                    imageVector = Icons.Default.AutoAwesome,
                    contentDescription = "AI Assistant",
                    tint = Color.White,
                    modifier = Modifier.size(22.dp)
                )
            }
            Spacer(modifier = Modifier.width(12.dp))
            Column(
                modifier = Modifier.weight(1f)
            ) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text(
                        text = "NOVA ChatGPT AI 🤖",
                        fontWeight = FontWeight.Bold,
                        style = MaterialTheme.typography.bodyLarge,
                        color = MaterialTheme.colorScheme.onSurface
                    )
                    Box(
                        modifier = Modifier
                            .clip(RoundedCornerShape(6.dp))
                            .background(MaterialTheme.colorScheme.primary.copy(alpha = 0.12f))
                            .padding(horizontal = 6.dp, vertical = 2.dp)
                    ) {
                        Text(
                            text = "SECURE AI",
                            fontSize = 8.sp,
                            fontWeight = FontWeight.Black,
                            color = MaterialTheme.colorScheme.primary,
                            letterSpacing = 0.5.sp
                        )
                    }
                }
                Spacer(modifier = Modifier.height(2.dp))
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Box(
                        modifier = Modifier
                            .size(6.dp)
                            .clip(CircleShape)
                            .background(Color(0xFF00E676)) // glowing green online dot
                    )
                    Spacer(modifier = Modifier.width(6.dp))
                    Text(
                        text = "Encrypted cognitive node active. Tap to chat.",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis
                    )
                }
            }
        }
    }
}

// --- DYNAMIC CONTACT LIST ITEM VIEW (BENTO STYLE) ---
@Composable
fun ChatItemView(chat: Chat, iconColor: Long, isGroup: Boolean = false, onClick: () -> Unit) {
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp, vertical = 6.dp)
            .clickable(onClick = onClick),
        shape = RoundedCornerShape(20.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.5f)),
        elevation = CardDefaults.cardElevation(defaultElevation = 0.5.dp)
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(12.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            // Initials avatar with gradient background
            Box(
                modifier = Modifier
                    .size(46.dp)
                    .clip(CircleShape)
                    .background(
                        Brush.verticalGradient(
                            listOf(
                                Color(iconColor),
                                Color(iconColor).copy(0.7f)
                            )
                        )
                    ),
                contentAlignment = Alignment.Center
            ) {
                if (isGroup) {
                    Icon(Icons.Default.Groups, contentDescription = null, tint = Color.White, modifier = Modifier.size(24.dp))
                } else {
                    val initials = chat.name.split(" ").mapNotNull { it.firstOrNull() }.take(2).joinToString("")
                    Text(
                        text = initials,
                        color = Color.White,
                        fontSize = 15.sp,
                        fontWeight = FontWeight.Bold
                    )
                }
            }

            Spacer(modifier = Modifier.width(14.dp))

            Column(
                modifier = Modifier.weight(1f)
            ) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text(
                        text = chat.name,
                        style = MaterialTheme.typography.titleMedium.copy(
                            fontWeight = FontWeight.Bold,
                            color = MaterialTheme.colorScheme.onSurface
                        ),
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                        modifier = Modifier.weight(1f)
                    )
                    
                    val date = Date(chat.lastMsgTimestamp)
                    val format = SimpleDateFormat("hh:mm a", Locale.getDefault())
                    Text(
                        text = format.format(date),
                        style = MaterialTheme.typography.bodySmall.copy(
                            color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.6f)
                        ),
                        modifier = Modifier.padding(start = 6.dp)
                    )
                }

                Spacer(modifier = Modifier.height(4.dp))

                Row(
                    modifier = Modifier.fillMaxWidth(),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    if (!chat.isGroup && (chat.lastMessage.contains("Kal class") || chat.lastMessage.contains("Kal college"))) {
                        Icon(
                            imageVector = Icons.Default.DoneAll,
                            contentDescription = "Delivered",
                            tint = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.4f),
                            modifier = Modifier.size(16.dp).padding(end = 4.dp)
                        )
                    } else if (!chat.lastMessage.startsWith("Tap to start")) {
                        Icon(
                            imageVector = Icons.Default.DoneAll,
                            contentDescription = "Read",
                            tint = SystemBlue,
                            modifier = Modifier.size(16.dp).padding(end = 4.dp)
                        )
                    }
                    
                    Text(
                        text = chat.lastMessage,
                        style = MaterialTheme.typography.bodyMedium.copy(
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        ),
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                        modifier = Modifier.weight(1f)
                    )

                    if (chat.unreadCount > 0) {
                        Box(
                            modifier = Modifier
                                .padding(start = 6.dp)
                                .size(20.dp)
                                .clip(CircleShape)
                                .background(AccentGreen),
                            contentAlignment = Alignment.Center
                        ) {
                            Text(
                                text = chat.unreadCount.toString(),
                                color = Color.Black,
                                fontSize = 11.sp,
                                fontWeight = FontWeight.Bold
                            )
                        }
                    }
                }
            }
        }
    }
}

// --- CALL HISTORY LIST ITEM VIEW ---
@Composable
fun CallLogItemView(log: CallLog, onCallClick: () -> Unit) {
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp, vertical = 6.dp),
        shape = RoundedCornerShape(20.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.5f)),
        elevation = CardDefaults.cardElevation(defaultElevation = 0.5.dp)
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(12.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Box(
                modifier = Modifier
                    .size(44.dp)
                    .clip(CircleShape)
                    .background(Color(log.avatarColor)),
                contentAlignment = Alignment.Center
            ) {
                val initials = log.contactName.split(" ").mapNotNull { it.firstOrNull() }.take(2).joinToString("")
                Text(
                    initials,
                    color = Color.White,
                    fontWeight = FontWeight.Bold,
                    fontSize = 15.sp
                )
            }

            Spacer(modifier = Modifier.width(14.dp))

            Column(
                modifier = Modifier.weight(1f)
            ) {
                Text(
                    text = log.contactName,
                    style = MaterialTheme.typography.titleMedium.copy(
                        fontWeight = FontWeight.Bold,
                        color = MaterialTheme.colorScheme.onSurface
                    )
                )

                Spacer(modifier = Modifier.height(4.dp))

                Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(
                        imageVector = if (log.isIncoming) Icons.Default.CallReceived else Icons.Default.CallMade,
                        contentDescription = null,
                        tint = if (!log.wasAnswered && log.isIncoming) Color.Red else AccentGreen,
                        modifier = Modifier.size(14.dp)
                    )
                    Spacer(modifier = Modifier.width(6.dp))
                    val date = Date(log.timestamp)
                    val format = SimpleDateFormat("MMM dd, hh:mm a", Locale.getDefault())
                    Text(
                        text = "${format.format(date)} • ${log.durationText}",
                        style = MaterialTheme.typography.bodySmall.copy(
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    )
                }
            }

            IconButton(onClick = onCallClick) {
                Icon(
                    imageVector = if (log.isVideo) Icons.Default.Videocam else Icons.Default.Call,
                    contentDescription = "Redial",
                    tint = MaterialTheme.colorScheme.primary
                )
            }
        }
    }
}

// --- WHATSAPP STORIES / STATUS SECTION ---
@Composable
fun StatusTabContent(viewModel: ChatViewModel, allUsers: List<User>) {
    val myUsername by viewModel.myUsername.collectAsState()
    val myEmail by viewModel.myEmail.collectAsState()
    val nonMeUsers = allUsers.filter { it.id != 0 }
    
    var showFullWipeConfirm by remember { mutableStateOf(false) }

    Column(modifier = Modifier.fillMaxSize()) {
        // My Profile & Cryptographic Node details dashboard card
        Card(
            modifier = Modifier
                .fillMaxWidth()
                .padding(16.dp),
            shape = RoundedCornerShape(24.dp),
            colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.primaryContainer.copy(alpha = 0.12f)),
            border = BorderStroke(1.dp, MaterialTheme.colorScheme.primary.copy(alpha = 0.25f))
        ) {
            Column(modifier = Modifier.padding(16.dp)) {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Box(
                        modifier = Modifier
                            .size(50.dp)
                            .clip(CircleShape)
                            .background(
                                brush = Brush.linearGradient(
                                    colors = listOf(Color(0xFF00FF87), Color(0xFF00F2FE))
                                )
                            ),
                        contentAlignment = Alignment.Center
                    ) {
                        val initials = if (myUsername.isNotBlank()) {
                            myUsername.split(" ").mapNotNull { it.firstOrNull() }.take(2).joinToString("").uppercase()
                        } else "U"
                        Text(
                            text = initials,
                            color = Color(0xFF040810),
                            fontWeight = FontWeight.Black,
                            fontSize = 16.sp
                        )
                    }
                    Spacer(modifier = Modifier.width(12.dp))
                    Column(modifier = Modifier.weight(1f)) {
                        Text(
                            text = if (myUsername.isNotEmpty()) myUsername else "Secure User Node",
                            fontWeight = FontWeight.Bold,
                            style = MaterialTheme.typography.titleMedium,
                            color = MaterialTheme.colorScheme.onSurface
                        )
                        Text(
                            text = if (myEmail.isNotEmpty()) myEmail else "secure-profile@privat.app",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }
                    Box(
                        modifier = Modifier
                            .clip(RoundedCornerShape(6.dp))
                            .background(AccentGreen.copy(alpha = 0.12f))
                            .padding(horizontal = 6.dp, vertical = 2.dp)
                    ) {
                        Text(
                            text = "ACTIVE",
                            fontSize = 8.sp,
                            fontWeight = FontWeight.Black,
                            color = AccentGreen
                        )
                    }
                }
                
                HorizontalDivider(
                    modifier = Modifier.padding(vertical = 12.dp),
                    color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.08f)
                )
                
                Text(
                    text = "Node Signature: SHA-256 E2EE Verified 🔒",
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    fontFamily = androidx.compose.ui.text.font.FontFamily.Monospace
                )
                
                Spacer(modifier = Modifier.height(14.dp))
                
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    // Lock App / Temporary Logout Button
                    Button(
                        onClick = { viewModel.logout() },
                        modifier = Modifier.weight(1.5f),
                        colors = ButtonDefaults.buttonColors(
                            containerColor = MaterialTheme.colorScheme.surfaceVariant,
                            contentColor = MaterialTheme.colorScheme.onSurfaceVariant
                        ),
                        shape = RoundedCornerShape(12.dp),
                        contentPadding = PaddingValues(vertical = 10.dp)
                    ) {
                        Icon(Icons.Default.Lock, contentDescription = null, modifier = Modifier.size(16.dp))
                        Spacer(modifier = Modifier.width(6.dp))
                        Text("Lock Vault", fontWeight = FontWeight.Bold, fontSize = 12.sp)
                    }
                    
                    // Permanent Wipe & Reset Logout Button
                    Button(
                        onClick = { showFullWipeConfirm = true },
                        modifier = Modifier.weight(1.5f),
                        colors = ButtonDefaults.buttonColors(
                            containerColor = Color(0xFFEF5350).copy(alpha = 0.85f),
                            contentColor = Color.White
                        ),
                        shape = RoundedCornerShape(12.dp),
                        contentPadding = PaddingValues(vertical = 10.dp)
                    ) {
                        Icon(Icons.Default.Logout, contentDescription = null, modifier = Modifier.size(16.dp))
                        Spacer(modifier = Modifier.width(6.dp))
                        Text("Sign Out Node", fontWeight = FontWeight.Bold, fontSize = 11.sp)
                    }
                }
            }
        }

        // Full profile wipe confirmation dialog
        if (showFullWipeConfirm) {
            AlertDialog(
                onDismissRequest = { showFullWipeConfirm = false },
                title = {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Icon(
                            imageVector = Icons.Default.DeleteSweep,
                            tint = Color(0xFFEF5350),
                            modifier = Modifier.size(24.dp),
                            contentDescription = null
                        )
                        Spacer(modifier = Modifier.width(8.dp))
                        Text("Wipe Profile & Sign Out", fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.onSurface)
                    }
                },
                text = {
                    Text(
                        text = "This action will completely wipe your local profile keys and remove this device's registration lock so another account can sign up or log in. All local data will be safely zero-purged.",
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                },
                confirmButton = {
                    Button(
                        onClick = {
                            showFullWipeConfirm = false
                            viewModel.clearDeviceProfile()
                        },
                        colors = ButtonDefaults.buttonColors(containerColor = Color(0xFFEF5350))
                    ) {
                        Text("Unbind Device Profile", color = Color.White, fontWeight = FontWeight.Bold)
                    }
                },
                dismissButton = {
                    TextButton(onClick = { showFullWipeConfirm = false }) {
                        Text("Cancel", fontWeight = FontWeight.Bold)
                    }
                },
                shape = RoundedCornerShape(24.dp),
                containerColor = MaterialTheme.colorScheme.surface
            )
        }

        // Add Status Card below the Profile Dashboard
        Card(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 16.dp, vertical = 4.dp),
            shape = RoundedCornerShape(20.dp),
            colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
            border = BorderStroke(1.dp, MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.5f))
        ) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(16.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Box(modifier = Modifier.size(56.dp)) {
                    Box(
                        modifier = Modifier
                            .fillMaxSize()
                            .clip(CircleShape)
                            .background(AccentGreen.copy(0.12f)),
                        contentAlignment = Alignment.Center
                    ) {
                        Icon(Icons.Default.Person, contentDescription = null, tint = AccentGreen, modifier = Modifier.size(32.dp))
                    }
                    Box(
                        modifier = Modifier
                            .size(20.dp)
                            .clip(CircleShape)
                            .background(AccentGreen)
                            .align(Alignment.BottomEnd)
                            .border(1.5.dp, MaterialTheme.colorScheme.surface, CircleShape),
                        contentAlignment = Alignment.Center
                    ) {
                        Icon(Icons.Default.Add, contentDescription = null, tint = Color.White, modifier = Modifier.size(14.dp))
                    }
                }
                Spacer(modifier = Modifier.width(14.dp))
                Column {
                    Text("My Status Updates", fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.onSurface, fontSize = 16.sp)
                    Text("Tap to add fresh status updates", color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 14.sp)
                }
            }
        }

        Box(
            modifier = Modifier
                .fillMaxWidth()
                .background(MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.4f))
                .padding(horizontal = 16.dp, vertical = 8.dp)
        ) {
            Text(
                "Recent Updates (Private Circle Only)",
                color = MaterialTheme.colorScheme.primary,
                fontWeight = FontWeight.Bold,
                fontSize = 12.sp
            )
        }

        LazyColumn(
            modifier = Modifier
                .weight(1f)
                .padding(top = 8.dp)
        ) {
            items(nonMeUsers) { user ->
                Card(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 16.dp, vertical = 6.dp),
                    shape = RoundedCornerShape(20.dp),
                    colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
                    border = BorderStroke(1.dp, MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.5f))
                ) {
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(12.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        // Circle story ring around avatar
                        Box(
                            modifier = Modifier
                                .size(50.dp)
                                .border(2.dp, AccentGreen, CircleShape)
                                .padding(3.dp)
                                .clip(CircleShape)
                                .background(Color(user.avatarColor)),
                            contentAlignment = Alignment.Center
                        ) {
                            val initials = user.username.split(" ").mapNotNull { it.firstOrNull() }.take(2).joinToString("")
                            Text(initials, color = Color.White, fontWeight = FontWeight.Bold, fontSize = 15.sp)
                        }

                        Spacer(modifier = Modifier.width(14.dp))

                        Column {
                            Text(user.username, fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.onSurface, fontSize = 15.sp)
                            val relativeMockTime = when(user.id % 3) {
                                0 -> "Just now"
                                1 -> "35 minutes ago"
                                else -> "2 hours ago"
                            }
                            Text(relativeMockTime, color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 12.sp)
                        }
                    }
                }
            }
        }
    }
}

// --- FULL CHAT WINDOW ---
@Composable
fun ChatScreen(viewModel: ChatViewModel, chatId: String) {
    val myUsername by viewModel.myUsername.collectAsState()
    val allChats by viewModel.allChats.collectAsState()
    val allUsers by viewModel.allUsers.collectAsState()
    val messages by viewModel.currentMessages.collectAsState()
    val typingStatus by viewModel.typingStatus.collectAsState()

    val chat = allChats.firstOrNull { it.id == chatId } ?: Chat(chatId, "Secure Chat", "", 0, false)
    var textInput by remember { mutableStateOf("") }
    
    var showAttachmentDrawer by remember { mutableStateOf(false) }
    var showEncryptionVerifySheet by remember { mutableStateOf(false) }
    
    val listState = rememberLazyListState()
    val scope = rememberCoroutineScope()

    // Trigger scroll-to-bottom on messages change
    LaunchedEffect(messages.size, typingStatus) {
        if (messages.isNotEmpty()) {
            listState.animateScrollToItem(messages.size - 1)
        }
    }

    Scaffold(
        topBar = {
            Column(modifier = Modifier.background(DarkSurface).windowInsetsPadding(WindowInsets.statusBars)) {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(64.dp)
                        .padding(end = 8.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    IconButton(onClick = { viewModel.setActiveChat(null) }) {
                        Icon(Icons.Default.ArrowBack, contentDescription = "Close", tint = Color.White)
                    }

                    // Rounded Avatar
                    Box(
                        modifier = Modifier
                            .size(38.dp)
                            .clip(CircleShape)
                            .background(
                                Brush.verticalGradient(
                                    listOf(
                                        Color(0xFF00A884),
                                        Color(0xFF008069)
                                    )
                                )
                            ),
                        contentAlignment = Alignment.Center
                    ) {
                        if (chat.isGroup) {
                            Icon(Icons.Default.Groups, contentDescription = null, tint = DarkBg, modifier = Modifier.size(20.dp))
                        } else {
                            val initials = chat.name.split(" ").mapNotNull { it.firstOrNull() }.take(2).joinToString("")
                            Text(initials, color = DarkBg, fontWeight = FontWeight.Bold, fontSize = 14.sp)
                        }
                    }

                    Spacer(modifier = Modifier.width(10.dp))

                    Column(
                        modifier = Modifier
                            .weight(1f)
                            .clickable { showEncryptionVerifySheet = true }
                    ) {
                        Text(
                            text = chat.name,
                            style = MaterialTheme.typography.titleMedium.copy(
                                fontWeight = FontWeight.Bold,
                                color = Color.White
                            ),
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis
                        )
                        Text(
                            text = typingStatus ?: if (chat.id == "group_main") "🌐 Global Server Online" else if (chat.isGroup) "tap for E2EE info" else "online",
                            style = MaterialTheme.typography.bodySmall.copy(
                                color = if (typingStatus != null || chat.id == "group_main") AccentGreen else TextMuted,
                                fontWeight = if (typingStatus != null || chat.id == "group_main") FontWeight.Bold else FontWeight.Normal
                            ),
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis
                        )
                    }

                    // Encryption status key indicator
                    IconButton(onClick = { showEncryptionVerifySheet = true }) {
                        Icon(
                            imageVector = Icons.Filled.Lock,
                            contentDescription = "Verify Keys",
                            tint = AccentGreen,
                            modifier = Modifier.size(20.dp)
                        )
                    }

                    // Call icons (Only map for solo chats under private 15 filter, or simulated for groups)
                    val targetContact = allUsers.firstOrNull { "direct_${it.id}" == chat.id } ?: allUsers.firstOrNull { it.id == 1 }

                    IconButton(onClick = {
                        if (targetContact != null) {
                            viewModel.initiateOutgoingCall(targetContact, isVideo = false)
                        }
                    }) {
                        Icon(Icons.Default.Call, contentDescription = "Voice Call", tint = Color.White)
                    }

                    IconButton(onClick = {
                        if (targetContact != null) {
                            viewModel.initiateOutgoingCall(targetContact, isVideo = true)
                        }
                    }) {
                        Icon(Icons.Default.Videocam, contentDescription = "Video Call", tint = Color.White)
                    }
                }
            }
        },
        containerColor = DarkBg
    ) { innerPadding ->
        // Chat Canvas Sandbox with authentic wallpaper backgrounds
        Box(
            modifier = Modifier
                .fillMaxSize()
                .padding(innerPadding)
                .drawBehind {
                    // Subtle retro digital pattern drawn directly in behind
                    val pColor = Color(0xFF151D24)
                    val stroke = 1.dp.toPx()
                    for (x in 0 until size.width.toInt() step 50) {
                        drawLine(pColor, Offset(x.toFloat(), 0f), Offset(x.toFloat(), size.height), stroke)
                    }
                    for (y in 0 until size.height.toInt() step 50) {
                        drawLine(pColor, Offset(0f, y.toFloat()), Offset(size.width, y.toFloat()), stroke)
                    }
                }
        ) {
            Column(modifier = Modifier.fillMaxSize()) {
                // Scrollable bubble stream
                LazyColumn(
                    state = listState,
                    modifier = Modifier
                        .weight(1f)
                        .fillMaxWidth()
                        .padding(horizontal = 14.dp)
                ) {
                    item {
                        Box(
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(vertical = 14.dp),
                            contentAlignment = Alignment.Center
                        ) {
                            Box(
                                modifier = Modifier
                                    .clip(RoundedCornerShape(8.dp))
                                    .background(DarkSurface)
                                    .padding(vertical = 6.dp, horizontal = 10.dp)
                            ) {
                                Row(verticalAlignment = Alignment.CenterVertically) {
                                    Icon(
                                        Icons.Default.Lock,
                                        contentDescription = null,
                                        tint = AccentGreen,
                                        modifier = Modifier.size(12.dp)
                                    )
                                    Spacer(modifier = Modifier.width(6.dp))
                                    Text(
                                        text = "MESSAGES ARE END-TO-END ENCRYPTED",
                                        color = AccentGreen,
                                        fontSize = 10.sp,
                                        fontWeight = FontWeight.Bold,
                                        textAlign = TextAlign.Center
                                    )
                                }
                            }
                        }
                    }

                    items(messages, key = { it.id }) { msg ->
                        MessageBubble(msg = msg, isMe = msg.senderId == 0)
                        Spacer(modifier = Modifier.height(4.dp))
                    }
                }

                // Interactive media tray overlay drawer
                AnimatedVisibility(
                    visible = showAttachmentDrawer,
                    enter = expandVertically(animationSpec = spring(stiffness = Spring.StiffnessMedium)),
                    exit = shrinkVertically(animationSpec = spring(stiffness = Spring.StiffnessMedium))
                ) {
                    AttachmentPickerTray { pickType ->
                        showAttachmentDrawer = false
                        viewModel.sendMediaAttachment(pickType)
                    }
                }

                // Bottom active message input card
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(8.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Row(
                        modifier = Modifier
                            .weight(1f)
                            .background(DarkSurface, RoundedCornerShape(26.dp))
                            .padding(horizontal = 10.dp, vertical = 2.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        IconButton(onClick = { /* Emoji simulation placeholder */ }) {
                            Icon(Icons.Default.SentimentSatisfied, contentDescription = "Emojis", tint = TextMuted)
                        }

                        IconButton(onClick = { showAttachmentDrawer = !showAttachmentDrawer }) {
                            Icon(Icons.Default.AttachFile, contentDescription = "Attachments", tint = TextMuted)
                        }

                        TextField(
                            value = textInput,
                            onValueChange = { textInput = it },
                            placeholder = { Text("Message...", color = TextMuted) },
                            colors = TextFieldDefaults.colors(
                                focusedContainerColor = Color.Transparent,
                                unfocusedContainerColor = Color.Transparent,
                                disabledContainerColor = Color.Transparent,
                                focusedIndicatorColor = Color.Transparent,
                                unfocusedIndicatorColor = Color.Transparent,
                                focusedTextColor = Color.White,
                                unfocusedTextColor = Color.White
                            ),
                            singleLine = false,
                            maxLines = 4,
                            modifier = Modifier.weight(1f)
                        )

                        if (textInput.isEmpty()) {
                            IconButton(onClick = {
                                viewModel.sendMediaAttachment("IMAGE") // Simulated instant photo upload
                            }) {
                                Icon(Icons.Default.CameraAlt, contentDescription = "Camera", tint = TextMuted)
                            }
                        }
                    }

                    Spacer(modifier = Modifier.width(6.dp))

                    // Green Floating Round send card button
                    IconButton(
                        onClick = {
                            if (textInput.isNotBlank()) {
                                viewModel.sendTextMessage(textInput)
                                textInput = ""
                            } else {
                                // Simulated Voice Note (Audio sharing) if input is empty!
                                viewModel.sendMediaAttachment("AUDIO")
                            }
                        },
                        modifier = Modifier
                            .size(50.dp)
                            .background(DarkPrimary, CircleShape)
                    ) {
                        Icon(
                            imageVector = if (textInput.isNotBlank()) Icons.Default.Send else Icons.Default.Mic,
                            contentDescription = "Send",
                            tint = DarkBg
                        )
                    }
                }
            }
        }
    }

    // Modal Verification verification sheet
    if (showEncryptionVerifySheet) {
        EncryptionKeyVerificationSheet(
            contactName = chat.name,
            isGroup = chat.isGroup,
            authUsersCount = if (chat.isGroup) 15 else 2,
            onDismiss = { showEncryptionVerifySheet = false }
        )
    }
}

// --- SECURE CHAT SPEECH BUBBLES ---
@Composable
fun MessageBubble(msg: Message, isMe: Boolean) {
    val isDark = isSystemInDarkTheme()
    val bubbleColor = if (isMe) {
        if (isDark) Color(0xFF004D40) else Color(0xFFD1EADC)
    } else {
        if (isDark) Color(0xFF1E293B) else Color(0xFFF1F5F9)
    }
    val alignment = if (isMe) Alignment.CenterEnd else Alignment.CenterStart
    val shape = if (isMe) {
        RoundedCornerShape(16.dp, 16.dp, 2.dp, 16.dp)
    } else {
        RoundedCornerShape(16.dp, 16.dp, 16.dp, 2.dp)
    }

    Box(
        modifier = Modifier.fillMaxWidth(),
        contentAlignment = alignment
    ) {
        Card(
            shape = shape,
            colors = CardDefaults.cardColors(containerColor = bubbleColor),
            modifier = Modifier
                .widthIn(max = 290.dp)
                .padding(vertical = 2.dp)
        ) {
            Column(modifier = Modifier.padding(10.dp)) {
                // Sender Name for Group Chats
                if (!isMe && msg.senderName.isNotEmpty() && msg.chatId == "group_main") {
                    val labelColor = when (msg.senderId % 4) {
                        1 -> Color(0xFFFF4081)
                        2 -> Color(0xFFFF9100)
                        3 -> Color(0xFF00E5FF)
                        else -> Color(0xFFE040FB)
                    }
                    Text(
                        text = msg.senderName,
                        fontWeight = FontWeight.Bold,
                        color = labelColor,
                        fontSize = 12.sp,
                        modifier = Modifier.padding(bottom = 4.dp)
                    )
                }

                // If media message layout
                if (msg.mediaType != null) {
                    MediaAttachmentLayout(
                        type = msg.mediaType,
                        mediaUrl = msg.mediaUrl ?: "",
                        size = msg.mediaSize ?: "1.4 MB"
                    )
                    Spacer(modifier = Modifier.height(6.dp))
                }

                // Message Text Text
                if (msg.mediaType == null || !msg.content.startsWith("Sent a media")) {
                    Text(
                        text = msg.content,
                        color = if (isMe) {
                            if (isDark) Color(0xFFE0F2F1) else Color(0xFF003833)
                        } else {
                            MaterialTheme.colorScheme.onSurface
                        },
                        fontSize = 15.sp,
                        lineHeight = 20.sp
                    )
                }

                Spacer(modifier = Modifier.height(4.dp))

                // Timestamp plus Tick checks
                Row(
                    modifier = Modifier.align(Alignment.End),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    val date = Date(msg.timestamp)
                    val format = SimpleDateFormat("hh:mm a", Locale.getDefault())
                    Text(
                        text = format.format(date),
                        fontSize = 10.sp,
                        color = if (isMe) {
                            if (isDark) Color(0xFFE0F2F1).copy(alpha = 0.6f) else Color(0xFF003833).copy(alpha = 0.6f)
                        } else {
                            MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.6f)
                        }
                    )
                    if (isMe) {
                        Spacer(modifier = Modifier.width(4.dp))
                        val tickColor = if (msg.status == 2) SystemBlue else {
                            if (isDark) Color(0xFFE0F2F1).copy(alpha = 0.4f) else Color(0xFF003833).copy(alpha = 0.4f)
                        }
                        Icon(
                            imageVector = if (msg.status >= 1) Icons.Default.DoneAll else Icons.Default.Done,
                            contentDescription = "Status",
                            tint = tickColor,
                            modifier = Modifier.size(14.dp)
                        )
                    }
                }
            }
        }
    }
}

// --- MEDIA ATTACHMENTS VIEW DECORATIONS ---
@Composable
fun MediaAttachmentLayout(type: String, mediaUrl: String, size: String) {
    when (type) {
        "IMAGE" -> {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(160.dp)
                    .clip(RoundedCornerShape(12.dp))
                    .background(Color.Black.copy(0.4f)),
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.Center
            ) {
                Icon(Icons.Filled.Image, contentDescription = null, tint = AccentGreen, modifier = Modifier.size(48.dp))
                Spacer(modifier = Modifier.height(8.dp))
                Text("E2EE Encrypted Photo", color = Color.White, fontWeight = FontWeight.Bold, fontSize = 13.sp)
                Text(size, color = TextMuted, fontSize = 11.sp)
            }
        }
        "VIDEO" -> {
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(160.dp)
                    .clip(RoundedCornerShape(12.dp))
                    .background(Color.Black.copy(0.5f)),
                contentAlignment = Alignment.Center
            ) {
                // Play Icon
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    Box(
                        modifier = Modifier
                            .size(50.dp)
                            .background(Color.White.copy(0.2f), CircleShape),
                        contentAlignment = Alignment.Center
                    ) {
                        Icon(Icons.Filled.PlayArrow, contentDescription = null, tint = Color.White, modifier = Modifier.size(32.dp))
                    }
                    Spacer(modifier = Modifier.height(8.dp))
                    Text("Secure Video Clip • $size", color = Color.White, fontSize = 12.sp)
                }
            }
        }
        "DOCUMENT" -> {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .background(Color.Black.copy(0.2f), RoundedCornerShape(8.dp))
                    .padding(10.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Box(
                    modifier = Modifier
                        .size(40.dp)
                        .background(Color(0xFFE53935), RoundedCornerShape(6.dp)),
                    contentAlignment = Alignment.Center
                ) {
                    Icon(Icons.Default.InsertDriveFile, contentDescription = null, tint = Color.White)
                }
                Spacer(modifier = Modifier.width(10.dp))
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        mediaUrl,
                        color = Color.White,
                        fontWeight = FontWeight.Bold,
                        fontSize = 13.sp,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis
                    )
                    Text("$size • PDF Document", color = TextMuted, fontSize = 11.sp)
                }
                Icon(Icons.Default.Download, contentDescription = "Download File", tint = DarkPrimary, modifier = Modifier.size(20.dp))
            }
        }
        "AUDIO" -> {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .background(Color.Black.copy(0.2f), RoundedCornerShape(8.dp))
                    .padding(8.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Box(
                    modifier = Modifier
                        .size(36.dp)
                        .background(AccentGreen, CircleShape),
                    contentAlignment = Alignment.Center
                ) {
                    Icon(Icons.Default.PlayArrow, contentDescription = null, tint = DarkBg)
                }
                Spacer(modifier = Modifier.width(10.dp))
                Column(modifier = Modifier.weight(1f)) {
                    // Audio slide graphic
                    Canvas(modifier = Modifier.fillMaxWidth().height(15.dp)) {
                        val canvasWidth = this.size.width
                        val canvasHeight = this.size.height
                        for (i in 0 until canvasWidth.toInt() step 12) {
                            val h = when (i % 3) {
                                0 -> 15f
                                1 -> 5f
                                else -> 25f
                            }
                            drawLine(
                                color = AccentGreen,
                                start = Offset(i.toFloat(), (canvasHeight - h)/2),
                                end = Offset(i.toFloat(), (canvasHeight + h)/2),
                                strokeWidth = 2.dp.toPx()
                            )
                        }
                    }
                    Spacer(modifier = Modifier.height(2.dp))
                    Text("0:45 • $size", color = TextMuted, fontSize = 10.sp)
                }
            }
        }
    }
}

// --- INTERACTIVE SHARING MENU TRAYS ---
@Composable
fun AttachmentPickerTray(onPick: (String) -> Unit) {
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .padding(8.dp),
        shape = RoundedCornerShape(24.dp),
        colors = CardDefaults.cardColors(containerColor = DarkSurface)
    ) {
        Column(modifier = Modifier.padding(16.dp)) {
            Text("E2EE Resource Upload (Strict 15-Friend Safe)", color = DarkPrimary, fontWeight = FontWeight.Bold, fontSize = 12.sp, modifier = Modifier.padding(bottom = 12.dp))
            
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceAround
            ) {
                AttachmentItem(icon = Icons.Default.InsertDriveFile, label = "Document", color = Color(0xFF7C4DFF)) { onPick("DOCUMENT") }
                AttachmentItem(icon = Icons.Default.CameraAlt, label = "Camera", color = Color(0xFFFF4081)) { onPick("IMAGE") }
                AttachmentItem(icon = Icons.Default.Image, label = "Gallery", color = Color(0xFF00E5FF)) { onPick("IMAGE") }
            }
            Spacer(modifier = Modifier.height(16.dp))
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceAround
            ) {
                AttachmentItem(icon = Icons.Default.Audiotrack, label = "Audio", color = Color(0xFFFF9100)) { onPick("AUDIO") }
                AttachmentItem(icon = Icons.Default.LocationOn, label = "Location", color = Color(0xFF00E676)) { onPick("IMAGE") }
                AttachmentItem(icon = Icons.Default.Person, label = "Contact", color = Color(0xFF2196F3)) { onPick("DOCUMENT") }
            }
        }
    }
}

@Composable
fun AttachmentItem(icon: androidx.compose.ui.graphics.vector.ImageVector, label: String, color: Color, onClick: () -> Unit) {
    Column(
        horizontalAlignment = Alignment.CenterHorizontally,
        modifier = Modifier
            .clickable(onClick = onClick)
            .padding(8.dp)
    ) {
        Box(
            modifier = Modifier
                .size(54.dp)
                .background(color, CircleShape),
            contentAlignment = Alignment.Center
        ) {
            Icon(imageVector = icon, contentDescription = label, tint = DarkBg, modifier = Modifier.size(24.dp))
        }
        Spacer(modifier = Modifier.height(6.dp))
        Text(text = label, color = Color.White, fontSize = 11.sp, fontWeight = FontWeight.Bold)
    }
}

// --- E2EE VERIFICATION DETAILS DIALOG SHEET ---
@Composable
fun EncryptionKeyVerificationSheet(
    contactName: String,
    isGroup: Boolean,
    authUsersCount: Int,
    onDismiss: () -> Unit
) {
    Dialog(
        onDismissRequest = onDismiss,
        properties = DialogProperties(usePlatformDefaultWidth = false)
    ) {
        Box(
            modifier = Modifier
                .fillMaxSize()
                .background(Color.Black.copy(0.75f))
                .clickable { onDismiss() },
            contentAlignment = Alignment.BottomCenter
        ) {
            Card(
                modifier = Modifier
                    .fillMaxWidth()
                    .heightIn(max = 550.dp)
                    .clickable(enabled = false) {}, // prevent click-through dismiss
                shape = RoundedCornerShape(topStart = 24.dp, topEnd = 24.dp),
                colors = CardDefaults.cardColors(containerColor = DarkSurface),
                border = BorderStroke(1.dp, AccentGreen.copy(0.3f))
            ) {
                Column(
                    modifier = Modifier
                        .padding(24.dp)
                        .verticalScroll(rememberScrollState()),
                    horizontalAlignment = Alignment.CenterHorizontally
                ) {
                    Box(
                        modifier = Modifier
                            .width(40.dp)
                            .height(4.dp)
                            .background(Color.White.copy(0.2f), RoundedCornerShape(2.dp))
                    )

                    Spacer(modifier = Modifier.height(16.dp))

                    Icon(
                        imageVector = Icons.Default.VerifiedUser,
                        contentDescription = null,
                        tint = AccentGreen,
                        modifier = Modifier.size(48.dp)
                    )

                    Spacer(modifier = Modifier.height(12.dp))

                    Text(
                        text = "Verify Security Code",
                        style = MaterialTheme.typography.titleLarge.copy(color = Color.White, fontWeight = FontWeight.Bold)
                    )

                    Text(
                        text = if (isGroup) "Group verification keys active across $authUsersCount secure nodes" else "Double-ratchet secure session established with $contactName",
                        style = MaterialTheme.typography.bodySmall.copy(color = TextMuted),
                        textAlign = TextAlign.Center,
                        modifier = Modifier.padding(top = 4.dp, bottom = 24.dp)
                    )

                    // Dummy QR Code Graphic
                    Box(
                        modifier = Modifier
                            .size(160.dp)
                            .background(Color.White, RoundedCornerShape(12.dp))
                            .padding(12.dp),
                        contentAlignment = Alignment.Center
                    ) {
                        Canvas(modifier = Modifier.fillMaxSize()) {
                            // Draw realistic QR bits
                            val bitSize = size.width / 10f
                            for (r in 0..9) {
                                for (c in 0..9) {
                                    val isAnchor = (r < 3 && c < 3) || (r < 3 && c > 6) || (r > 6 && c < 3)
                                    val shouldColor = isAnchor || ((r + c) % 2 == 0 && (r * c) % 3 != 0)
                                    if (shouldColor) {
                                        drawRect(
                                            color = Color.Black,
                                            topLeft = Offset(c * bitSize, r * bitSize),
                                            size = androidx.compose.ui.geometry.Size(bitSize, bitSize)
                                        )
                                    }
                                }
                            }
                        }
                    }

                    Spacer(modifier = Modifier.height(24.dp))

                    // Simulated 60 digit code lookup
                    val codeChunk = "70921 52014 94702 11956\n34920 81105 52834 50211\n45091 19283 50214 74112"
                    Text(
                        text = codeChunk,
                        color = AccentGreen,
                        fontFamily = androidx.compose.ui.text.font.FontFamily.Monospace,
                        fontSize = 14.sp,
                        textAlign = TextAlign.Center,
                        lineHeight = 22.sp,
                        modifier = Modifier
                            .background(Color.Black.copy(0.3f), RoundedCornerShape(12.dp))
                            .padding(14.dp)
                    )

                    Spacer(modifier = Modifier.height(16.dp))

                    Text(
                        text = "To confirm that messages in this loop are end-to-end encrypted, compare the 60-digit sequence above with other members. Standard biometric matching keys generate identical footprints.",
                        style = MaterialTheme.typography.bodySmall.copy(color = TextMuted, lineHeight = 16.sp),
                        textAlign = TextAlign.Center
                    )

                    Spacer(modifier = Modifier.height(24.dp))

                    Button(
                        onClick = onDismiss,
                        colors = ButtonDefaults.buttonColors(containerColor = AccentGreen)
                    ) {
                        Text("Encryption Match OK", color = Color.Black, fontWeight = FontWeight.Bold)
                    }
                }
            }
        }
    }
}

// --- SECURE VIDEO & VOICE ACTUAL CALLING HUD HOOD ---
@Composable
fun CallingOverlay(
    viewModel: ChatViewModel,
    receiver: User,
    isVideo: Boolean,
    state: CallState
) {
    val durationSeconds by viewModel.callDurationSeconds.collectAsState()
    
    // Animate ringing pulses
    val infiniteTransition = rememberInfiniteTransition(label = "pulse")
    val scalePulse by infiniteTransition.animateFloat(
        initialValue = 1.0f,
        targetValue = if (state == CallState.RINGING) 1.25f else 1.0f,
        animationSpec = infiniteRepeatable(
            animation = tween(1200, easing = LinearEasing),
            repeatMode = RepeatMode.Reverse
        ),
        label = "pulse_scale"
    )

    // Camera video preview simulated state
    var isFrontCamFacing by remember { mutableStateOf(true) }
    var isMuted by remember { mutableStateOf(false) }
    var isSpeakerOn by remember { mutableStateOf(isVideo) }

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(Color(0xFF0F171E))
    ) {
        if (isVideo && state == CallState.CONNECTED) {
            // Live active simulated front-facing video layout drawing
            Canvas(modifier = Modifier.fillMaxSize()) {
                // Background video simulation drawings
                val brush = Brush.radialGradient(
                    colors = listOf(Color(0xFF2C5E57), Color(0xFF0F171E)),
                    center = Offset(size.width * 0.5f, size.height * 0.4f),
                    radius = size.width * 0.8f
                )
                drawRect(brush)
                
                // Draw floating clean grid patterns representing digital scanning lines
                val spacing = 80f
                for (i in 0..(size.width / spacing).toInt()) {
                    drawLine(Color.White.copy(0.04f), Offset(i * spacing, 0f), Offset(i * spacing, size.height), 1f)
                }
                for (j in 0..(size.height / spacing).toInt()) {
                    drawLine(Color.White.copy(0.04f), Offset(0f, j * spacing), Offset(size.width, j * spacing), 1f)
                }

                // Draw user simulated video avatar outlines in middle
                drawCircle(
                    color = AccentGreen.copy(0.12f),
                    radius = size.width * 0.25f,
                    center = Offset(size.width * 0.5f, size.height * 0.45f)
                )

                // Simulated dynamic particle face tracking nodes
                drawCircle(Color.Green.copy(0.4f), 4f, Offset(size.width * 0.45f, size.height * 0.43f))
                drawCircle(Color.Green.copy(0.4f), 4f, Offset(size.width * 0.55f, size.height * 0.43f))
                drawCircle(Color.Green.copy(0.4f), 4f, Offset(size.width * 0.5f, size.height * 0.48f))
            }

            // Small self floating webcam overlay card inside call hud layout
            Box(
                modifier = Modifier
                    .padding(top = 48.dp, end = 20.dp)
                    .size(110.dp, 160.dp)
                    .clip(RoundedCornerShape(12.dp))
                    .background(Color.Black.copy(0.4f))
                    .border(1.5.dp, DarkPrimary, RoundedCornerShape(12.dp))
                    .align(Alignment.TopEnd)
            ) {
                Canvas(modifier = Modifier.fillMaxSize()) {
                    // Draw mini waveform
                    drawCircle(Color(0xFF2196F3).copy(0.2f), 30.dp.toPx(), center = Offset(size.width/2, size.height/2))
                }
                Text(
                    "Self",
                    color = Color.White.copy(0.7f),
                    fontSize = 11.sp,
                    fontWeight = FontWeight.Bold,
                    modifier = Modifier.padding(6.dp).align(Alignment.BottomStart)
                )
            }
        } else {
            // Voice Call Gradient Vibe background
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .background(
                        Brush.verticalGradient(
                            listOf(
                                Color(0xFF075E54).copy(alpha = 0.8f),
                                Color(0xFF128C7E).copy(alpha = 0.5f),
                                Color(0xFF0B141A)
                            )
                        )
                    )
            )
        }

        // Header call HUD indicators
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(top = 70.dp),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(
                    imageVector = Icons.Default.VerifiedUser,
                    contentDescription = null,
                    tint = AccentGreen,
                    modifier = Modifier.size(14.dp)
                )
                Spacer(modifier = Modifier.width(6.dp))
                Text(
                    text = "END-TO-END ENCRYPTED VOICE LINE",
                    style = MaterialTheme.typography.labelSmall.copy(color = AccentGreen, fontWeight = FontWeight.Bold)
                )
            }

            Spacer(modifier = Modifier.height(20.dp))

            // Pulse Avatar
            Box(
                modifier = Modifier
                    .size(120.dp)
                    .drawBehind {
                        if (state == CallState.RINGING || state == CallState.INCOMING) {
                            drawCircle(
                                color = DarkPrimary.copy(alpha = 0.25f),
                                radius = (size.width / 2) * scalePulse
                            )
                        }
                    }
                    .clip(CircleShape)
                    .background(Color(receiver.avatarColor)),
                contentAlignment = Alignment.Center
            ) {
                val initials = receiver.username.split(" ").mapNotNull { it.firstOrNull() }.take(2).joinToString("")
                Text(
                    initials,
                    color = DarkBg,
                    fontSize = 38.sp,
                    fontWeight = FontWeight.Bold
                )
            }

            Spacer(modifier = Modifier.height(20.dp))

            Text(
                text = receiver.username,
                color = Color.White,
                fontWeight = FontWeight.Bold,
                fontSize = 24.sp
            )

            Spacer(modifier = Modifier.height(6.dp))

            // Sub-status text (Ringing, Connected, Incoming etc)
            val subText = when (state) {
                CallState.RINGING -> "Ringing..."
                CallState.CONNECTED -> "Active Connection • ${viewModel.formatDuration(durationSeconds)}"
                CallState.DISCONNECTED -> "Disconnected Logged"
                CallState.INCOMING -> "Incoming caller request..."
                else -> ""
            }
            Text(
                text = subText,
                color = if (state == CallState.CONNECTED) AccentGreen else TextMuted,
                fontWeight = if (state == CallState.CONNECTED) FontWeight.Bold else FontWeight.Normal,
                fontSize = 15.sp
            )
        }

        // Pulse audio waveform visualization drawn direct to voice screen
        if (state == CallState.CONNECTED && !isVideo) {
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(100.dp)
                    .align(Alignment.Center)
            ) {
                val wavePhase = infiniteTransition.animateFloat(
                    initialValue = 0f,
                    targetValue = 360f,
                    animationSpec = infiniteRepeatable(
                        animation = tween(2000, easing = LinearEasing),
                        repeatMode = RepeatMode.Restart
                    ),
                    label = "wave"
                )

                Canvas(modifier = Modifier.fillMaxSize()) {
                    val path = Path()
                    val waveHeight = 25f
                    val waveLength = size.width / 2f
                    path.moveTo(0f, size.height / 2)
                    for (i in 0..size.width.toInt()) {
                        val angle = (i / waveLength) * Math.PI * 2 + Math.toRadians(wavePhase.value.toDouble())
                        val y = (size.height / 2) + Math.sin(angle) * waveHeight
                        path.lineTo(i.toFloat(), y.toFloat())
                    }
                    drawPath(
                        path = path,
                        color = DarkPrimary.copy(alpha = 0.4f),
                        style = Stroke(width = 3.dp.toPx())
                    )
                }
            }
        }

        // Standard caller control actions footer layout
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .navigationBarsPadding()
                .padding(bottom = 48.dp)
                .align(Alignment.BottomCenter),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            if (state == CallState.INCOMING) {
                // Incoming Slide Accept/Reject Panel
                Row(
                    modifier = Modifier.fillMaxWidth().padding(horizontal = 40.dp),
                    horizontalArrangement = Arrangement.SpaceBetween
                ) {
                    // Reject Button
                    IconButton(
                        onClick = { viewModel.endOrRejectCall() },
                        modifier = Modifier
                            .size(64.dp)
                            .background(Color(0xFFE53935), CircleShape)
                    ) {
                        Icon(Icons.Filled.CallEnd, contentDescription = "Decline Request", tint = Color.White)
                    }

                    // Accept Button
                    IconButton(
                        onClick = { viewModel.acceptIncomingCall() },
                        modifier = Modifier
                            .size(64.dp)
                            .background(AccentGreen, CircleShape)
                    ) {
                        Icon(Icons.Filled.Call, contentDescription = "Accept Request", tint = DarkBg)
                    }
                }
            } else {
                // Outgoing & Active Connected caller tray controls
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 30.dp),
                    horizontalArrangement = Arrangement.SpaceEvenly,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    // Mute
                    IconButton(
                        onClick = { isMuted = !isMuted },
                        modifier = Modifier
                            .size(50.dp)
                            .background(if (isMuted) Color.White else Color.White.copy(0.15f), CircleShape)
                    ) {
                        Icon(
                            imageVector = if (isMuted) Icons.Default.MicOff else Icons.Default.Mic,
                            contentDescription = "Mute",
                            tint = if (isMuted) Color.Black else Color.White
                        )
                    }

                    // Extra toggle (Camera Flip for video, Speaker for voice)
                    if (isVideo) {
                        IconButton(
                            onClick = { isFrontCamFacing = !isFrontCamFacing },
                            modifier = Modifier
                                .size(50.dp)
                                .background(Color.White.copy(0.15f), CircleShape)
                        ) {
                            Icon(Icons.Default.FlipCameraAndroid, contentDescription = "Flip Video Node", tint = Color.White)
                        }
                    } else {
                        IconButton(
                            onClick = { isSpeakerOn = !isSpeakerOn },
                            modifier = Modifier
                                .size(50.dp)
                                .background(if (isSpeakerOn) Color.White else Color.White.copy(0.15f), CircleShape)
                        ) {
                            Icon(
                                imageVector = Icons.Default.VolumeUp,
                                contentDescription = "Speaker Toggle",
                                tint = if (isSpeakerOn) Color.Black else Color.White
                            )
                        }
                    }

                    // Standard Red Decline Button
                    IconButton(
                        onClick = { viewModel.endOrRejectCall() },
                        modifier = Modifier
                            .size(64.dp)
                            .background(Color(0xFFE53935), CircleShape)
                    ) {
                        Icon(Icons.Filled.CallEnd, contentDescription = "Disconnect Session", tint = Color.White)
                    }
                }
            }
        }
    }
}

// Placeholder empty page layout helper
@Composable
fun EmptyListState(message: String, icon: androidx.compose.ui.graphics.vector.ImageVector) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(24.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center
    ) {
        Icon(
            imageVector = icon,
            contentDescription = null,
            tint = TextMuted.copy(alpha = 0.4f),
            modifier = Modifier.size(64.dp)
        )
        Spacer(modifier = Modifier.height(14.dp))
        Text(
            text = message,
            style = MaterialTheme.typography.bodyMedium.copy(color = TextMuted, textAlign = TextAlign.Center, lineHeight = 20.sp)
        )
    }
}
