package app.bimoda.android.ui

import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.ExperimentalTextApi
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.Font
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontVariation
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.sp
import app.bimoda.android.R

/**
 * Bimoda identity, "the night dock": a quiet petrol desk, the open case as a paper docket lying on it,
 * decisions as rubber stamps, on-device drawn SOLID and cloud drawn DASHED. Marigold means "act here".
 */
object Dock {
    val Bg = Color(0xFF0A1D29)
    val Surface = Color(0xFF0F2937)
    val Surface2 = Color(0xFF163748)
    val Line = Color(0xFF234B5E)
    val Text = Color(0xFFEEF3F2)
    val Muted = Color(0xFFA3BAC4)
    val Accent = Color(0xFFFFB238)
    val OnAccent = Color(0xFF1D1400)
    val Go = Color(0xFF4FD69C)
    val Stop = Color(0xFFFF8585)
    val Hold = Color(0xFFC0ACFF)
    val Info = Color(0xFF86C0FF)
    val Paper = Color(0xFFF3EEDF)
    val PaperInk = Color(0xFF17242C)
    val PaperMuted = Color(0xFF55646D)
    val PaperLine = Color(0xFFD6CCB3)
    val PaperStop = Color(0xFFB3262F)
    val PaperGo = Color(0xFF0D6B47)
    val PaperHold = Color(0xFF5A3FC0)
    val PaperInfo = Color(0xFF1A5AA8)
}

@OptIn(ExperimentalTextApi::class)
private fun archivo(weight: Int, width: Float) = FontFamily(
    Font(R.font.archivo, weight = FontWeight(weight), variationSettings = FontVariation.Settings(FontVariation.weight(weight), FontVariation.width(width))),
)

/** Archivo's width axis: narrow and heavy for display, like the bold line on a shipping label. */
val Display = archivo(800, 68f)
val Heading = archivo(700, 88f)
val Body = archivo(450, 100f)
val BodyBold = archivo(650, 100f)
val Figure = archivo(700, 75f)

object Type {
    val display = TextStyle(fontFamily = Display, fontSize = 40.sp, lineHeight = 40.sp, color = Dock.Text)
    val title = TextStyle(fontFamily = Heading, fontSize = 20.sp, lineHeight = 24.sp, color = Dock.Text)
    val body = TextStyle(fontFamily = Body, fontSize = 15.sp, lineHeight = 22.sp, color = Dock.Text)
    val bodyBold = TextStyle(fontFamily = BodyBold, fontSize = 15.sp, lineHeight = 22.sp, color = Dock.Text)
    val small = TextStyle(fontFamily = Body, fontSize = 13.sp, lineHeight = 18.sp, color = Dock.Muted)
    val label = TextStyle(fontFamily = BodyBold, fontSize = 12.sp, lineHeight = 16.sp, color = Dock.Muted)
    val mono = TextStyle(fontFamily = FontFamily.Monospace, fontSize = 12.sp, lineHeight = 17.sp, color = Dock.Text)
}
