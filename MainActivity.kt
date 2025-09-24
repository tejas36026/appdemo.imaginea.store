package com.example.news

import android.Manifest
import android.annotation.SuppressLint
import android.app.AlertDialog
import android.app.DownloadManager
import android.webkit.WebView
import android.print.PrintManager
import android.print.PrintAttributes
import android.webkit.WebSettings
import android.webkit.WebResourceRequest
import android.webkit.WebResourceError
import android.os.Handler
import android.os.Looper
import android.view.View
import android.view.ViewGroup
import android.widget.FrameLayout
import androidx.core.view.WindowInsetsCompat
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Environment
import android.provider.Settings
import android.util.Log
import android.webkit.JavascriptInterface
import android.webkit.URLUtil
import android.webkit.WebViewClient
import android.widget.Toast
import androidx.activity.ComponentActivity // Use the lightweight ComponentActivity
import androidx.activity.OnBackPressedCallback
import androidx.activity.result.contract.ActivityResultContracts
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import androidx.core.content.FileProvider
import androidx.core.net.toUri
import com.example.news.BuildConfig
import com.example.news.databinding.ActivityMainBinding
import java.io.File
import androidx.core.view.ViewCompat
import androidx.core.view.WindowCompat
import androidx.core.view.updatePadding

class MainActivity : ComponentActivity() { // Inherit from the lightweight ComponentActivity

    private lateinit var binding: ActivityMainBinding

    // Modern way to request permissions and handle the user's choice.
    private val requestPermissionLauncher =
        registerForActivityResult(ActivityResultContracts.RequestPermission()) { isGranted: Boolean ->
            if (isGranted) {
                Log.d("MainActivity_Perms", "Permission GRANTED by user.")
                // If a share was pending, retry it now with the granted permission.
                checkAndShare(pendingShareFilename, pendingShareTitle)
            } else {
                Log.d("MainActivity_Perms", "Permission DENIED by user.")
                // Check if the user selected "Don't ask again".
                if (!ActivityCompat.shouldShowRequestPermissionRationale(this, getRequiredPermission())) {
                    Log.d("MainActivity_Perms", "Permission permanently denied. Showing settings dialog.")
                    showSettingsRedirectDialog()
                } else {
                    Toast.makeText(this, "Permission denied. Cannot share file.", Toast.LENGTH_SHORT).show()
                }
            }
            // Clear the pending request.
            clearPendingShare()
        }

    // --- State variables to hold share data while asking for permission ---
    private var pendingShareFilename: String? = null
    private var pendingShareTitle: String? = null

    // --- BroadcastReceiver for download completion ---


    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        WindowCompat.setDecorFitsSystemWindows(window, false)

        binding = ActivityMainBinding.inflate(layoutInflater)
        setContentView(binding.root)

        ViewCompat.setOnApplyWindowInsetsListener(binding.root) { view, windowInsets ->
            val insets = windowInsets.getInsets(WindowInsetsCompat.Type.systemBars())
            // Apply the insets as padding to the view.
            view.updatePadding(
                top = insets.top,
                bottom = insets.bottom,
                left = insets.left,
                right = insets.right
            )
            windowInsets
        }

        setupOnBackPressed()
        setupWebView()
    }

    // This inner class is the "bridge" that JavaScript can call.

    inner class WebAppInterface {

        // Keep your share function as is
        @JavascriptInterface
        fun shareVideoFile(filename: String, title: String) {
            runOnUiThread {
                checkAndShare(filename, title)
            }
        }




        @JavascriptInterface
        fun printPage(htmlContent: String) {
            runOnUiThread {
                val printWebView = WebView(this@MainActivity).apply {
                    settings.apply {
                        javaScriptEnabled = true
                        domStorageEnabled = true  // Enable DOM storage for charts
                        loadWithOverviewMode = true
                        useWideViewPort = true
                        setSupportZoom(false)
                        displayZoomControls = false
                        // Allow mixed content if your charts use HTTP resources
                        mixedContentMode = WebSettings.MIXED_CONTENT_ALWAYS_ALLOW
                    }
                webViewClient = object : WebViewClient() {
                    override fun onPageFinished(view: WebView, url: String) {
                        super.onPageFinished(view, url)
                        Handler(Looper.getMainLooper()).postDelayed({
                            // 5. Additional JavaScript to ensure charts are rendered
                            view.evaluateJavascript("""
                            (function() {
                                // Force any pending chart renders
                                if (typeof Chart !== 'undefined' && Chart.instances) {
                                    Object.values(Chart.instances).forEach(chart => {
                                        if (chart && chart.update) chart.update();
                                    });
                                }
                                // Trigger any custom render events
                                window.dispatchEvent(new Event('beforeprint'));
                                return true;
                            })();
                        """.trimIndent()) { _ ->
                                // 6. Now create print job after charts are rendered
                                Handler(Looper.getMainLooper()).postDelayed({
                                    val printManager = getSystemService(Context.PRINT_SERVICE) as PrintManager
                                    val jobName = "Dashboard Report"
                                    val printAdapter = view.createPrintDocumentAdapter(jobName)

                                    // 7. Configure print attributes for better quality
                                    val printAttributes = PrintAttributes.Builder()
                                        .setMediaSize(PrintAttributes.MediaSize.ISO_A4)
                                        .setResolution(PrintAttributes.Resolution("pdf", "pdf", 300, 300))
                                        .setMinMargins(PrintAttributes.Margins.NO_MARGINS)
                                        .build()

                                    printManager.print(jobName, printAdapter, printAttributes)

                                    // 8. Clean up after print dialog is shown
                                    Handler(Looper.getMainLooper()).postDelayed({
                                        (view.parent as? ViewGroup)?.removeView(view)
                                    }, 500)
                                }, 500) // Wait 500ms after JavaScript execution
                            }
                        }, 1500) // Wait 1.5 seconds for initial render

                        val printManager = getSystemService(Context.PRINT_SERVICE) as PrintManager
                        val jobName = "Dashboard Report"
                        val printAdapter = view.createPrintDocumentAdapter(jobName)
                        printManager.print(
                            jobName,
                            printAdapter,
                            PrintAttributes.Builder().build()
                        )
                    }
                    override fun onReceivedError(view: WebView?, request: WebResourceRequest?, error: WebResourceError?) {
                        super.onReceivedError(view, request, error)
                        Log.e("PrintWebView", "Error loading content: ${error?.description}")
                    }
                }

                    layoutParams = FrameLayout.LayoutParams(
                        FrameLayout.LayoutParams.MATCH_PARENT,
                        FrameLayout.LayoutParams.MATCH_PARENT
                    )
                    visibility = View.INVISIBLE
                    alpha = 0f // Make completely transparent
                }
                    binding.root.addView(printWebView)

                    val enhancedHtml = """
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <style>
                    @media print {
                        body { 
                            -webkit-print-color-adjust: exact !important;
                            print-color-adjust: exact !important;
                            color-adjust: exact !important;
                        }
                        * {
                            -webkit-print-color-adjust: exact !important;
                            print-color-adjust: exact !important;
                            color-adjust: exact !important;
                        }
                    }
                </style>
            </head>
            <body>
                $htmlContent
            </body>
            </html>
        """.trimIndent()
                // It now loads the SPECIFIC HTML from the dashboard iframe
                    printWebView.loadDataWithBaseURL(
                        "https://typing1.imaginea.store/",
                        enhancedHtml,
                        "text/html",
                        "UTF-8",
                        null
                    )

                }
        }



    }

    @JavascriptInterface
    fun downloadPDF() {
        runOnUiThread {
            val printManager = getSystemService(Context.PRINT_SERVICE) as PrintManager
            val printAdapter = binding.webView.createPrintDocumentAdapter("Dashboard")

            // This would require additional PDF generation code
            // The simple printPage() method only opens the print dialog
        }
    }

    // --- Permission and Sharing Logic ---

    private fun checkAndShare(filename: String?, title: String?) {
        if (filename == null || title == null) return
        // Store details in case we need to ask for permission.
        pendingShareFilename = filename
        pendingShareTitle = title

        val permission = getRequiredPermission()

        when {
            // Case 1: Permission is already granted.
            ContextCompat.checkSelfPermission(this, permission) == PackageManager.PERMISSION_GRANTED -> {
                Log.d("MainActivity_Perms", "Permission already granted. Sharing file.")
                shareVideoFile(filename, title)
                clearPendingShare()
            }
            // Case 2: User denied before. We should show an explanation.
            ActivityCompat.shouldShowRequestPermissionRationale(this, permission) -> {
                Log.d("MainActivity_Perms", "Showing permission rationale dialog.")
                showPermissionRationaleDialog()
            }
            // Case 3: First time asking OR permission was permanently denied.
            else -> {
                Log.d("MainActivity_Perms", "Requesting permission for the first time or was permanently denied.")
                requestPermissionLauncher.launch(permission)
            }
        }
    }

    @JavascriptInterface
    fun printDashboardHtml(htmlContent: String) {
        runOnUiThread {
            // 1. Create a new, temporary WebView just for printing
            val printWebView = WebView(this@MainActivity)

            // 2. It's crucial to define a WebViewClient
            printWebView.webViewClient = object : WebViewClient() {
                override fun onPageFinished(view: WebView, url: String) {
                    super.onPageFinished(view, url)

                    // 3. The page is loaded, NOW we can print it
                    val printManager = getSystemService(Context.PRINT_SERVICE) as PrintManager
                    val jobName = "Dashboard Report"
                    val printAdapter = view.createPrintDocumentAdapter(jobName)

                    printManager.print(
                        jobName,
                        printAdapter,
                        PrintAttributes.Builder().build()
                    )
                }
            }

            // 4. Load the HTML content you passed from JavaScript into the temporary WebView.
            // The baseUrl is important for correctly loading resources like CSS if they have relative paths.
            printWebView.loadDataWithBaseURL("https://demo.imaginea.store/", htmlContent, "text/html", "UTF-8", null)
        }
    }




    // In MainActivity.java -> WebAppInterface class

    // In MainActivity.java -> WebAppInterface class




    private fun shareVideoFile(filename: String, title: String) {
        val downloadDir = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS)
        val videoFile = File(downloadDir, filename)
        Log.d("MainActivity_Share", "Attempting to share file at path: ${videoFile.absolutePath}")

        if (!videoFile.exists()) {
            Log.e("MainActivity_Share", "SHARE FAILED: File does not exist!")
            Toast.makeText(this, "Error: Downloaded file not found.", Toast.LENGTH_LONG).show()
            return
        }

        try {
            val fileUri: Uri = FileProvider.getUriForFile(this, "${BuildConfig.APPLICATION_ID}.provider", videoFile)
            Log.d("MainActivity_Share", "Successfully got FileProvider URI: $fileUri")

            val sendIntent = Intent().apply {
                action = Intent.ACTION_SEND
                type = "video/mp4"
                putExtra(Intent.EXTRA_STREAM, fileUri)
                putExtra(Intent.EXTRA_SUBJECT, title)
                addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
            }
            val shareIntent = Intent.createChooser(sendIntent, "Share Video")
            startActivity(shareIntent)
            Log.d("MainActivity_Share", "Share Intent started!")
        } catch (e: Exception) {
            Log.e("MainActivity_Share", "SHARE FAILED: Error creating FileProvider URI.", e)
            Toast.makeText(this, "Error: Could not share file.", Toast.LENGTH_LONG).show()
        }
    }

    // --- Helper Dialogs and Functions ---

    private fun showPermissionRationaleDialog() {
        AlertDialog.Builder(this)
            .setTitle("Permission Needed")
            .setMessage("To share the video, the app needs permission to access your device's video files.")
            .setPositiveButton("Continue") { _, _ ->
                // User agreed, now request the permission.
                requestPermissionLauncher.launch(getRequiredPermission())
            }
            .setNegativeButton("Cancel") { dialog, _ ->
                dialog.dismiss()
                clearPendingShare()
            }
            .show()
    }

    private fun showSettingsRedirectDialog() {
        AlertDialog.Builder(this)
            .setTitle("Permission Required")
            .setMessage("You have permanently denied the file access permission. To share videos, please enable it in the app settings.")
            .setPositiveButton("Go to Settings") { _, _ ->
                // Create an intent that opens this app's specific settings screen.
                val intent = Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS)
                val uri = Uri.fromParts("package", packageName, null)
                intent.data = uri
                startActivity(intent)
            }
            .setNegativeButton("Cancel") { dialog, _ ->
                dialog.dismiss()
            }
            .show()
    }

    private fun getRequiredPermission(): String {
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            Manifest.permission.READ_MEDIA_VIDEO
        } else {
            Manifest.permission.READ_EXTERNAL_STORAGE
        }
    }

    private fun clearPendingShare() {
        pendingShareFilename = null
        pendingShareTitle = null
    }

    // --- Setup and Lifecycle ---


    @SuppressLint("SetJavaScriptEnabled", "JavascriptInterface")
    private fun setupWebView() {
        // This allows you to use chrome://inspect to debug. Keep it for now.
        WebView.setWebContentsDebuggingEnabled(true)

        binding.webView.apply {
            settings.apply {
                javaScriptEnabled = true
                domStorageEnabled = true
                loadWithOverviewMode = true
                useWideViewPort = true
                allowFileAccess = true // Still useful for some web features
                allowContentAccess = true
            }

            requestFocus()
            isFocusableInTouchMode = true

            webViewClient = WebViewClient()

            addJavascriptInterface(WebAppInterface(), "AndroidInterface")
            loadUrl("https://typing1.imaginea.store/track")
        }
    }



    private fun setupOnBackPressed() {
        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                if (binding.webView.canGoBack()) {
                    binding.webView.goBack()
                } else {
                    isEnabled = false
                    onBackPressedDispatcher.onBackPressed()
                }
            }
        })
    }

    override fun onDestroy() {
        super.onDestroy()
    }
}
