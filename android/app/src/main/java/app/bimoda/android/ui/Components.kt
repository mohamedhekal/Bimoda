package app.bimoda.android.ui

import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.Spring
import androidx.compose.animation.core.spring
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.draw.scale
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import app.bimoda.android.ai.PrivacyMode
import app.bimoda.android.ai.Source
import app.bimoda.android.domain.Decision

/** Bimoda mark: two modes in one square. The solid half is "on this device", the dotted half is "over the wire". */
@Composable
fun Mark(size: Dp = 28.dp) {
    Canvas(Modifier.size(size)) {
        val u = this.size.width / 28f
        drawRoundRect(Dock.Accent, topLeft = Offset(2 * u, 2 * u), size = Size(12 * u, 24 * u), cornerRadius = CornerRadius(6 * u, 6 * u))
        drawRect(Dock.Accent, topLeft = Offset(9 * u, 2 * u), size = Size(5 * u, 24 * u))
        val dots = listOf(17f to 2f, 21.3f to 2.6f, 24.8f to 5.4f, 26f to 9.6f, 26f to 14f, 26f to 18.4f, 24.8f to 22.6f, 21.3f to 25.4f, 17f to 26f)
        dots.forEach { (x, y) -> drawCircle(Dock.Accent, radius = 1.15f * u, center = Offset(x * u, y * u)) }
    }
}

/** Solid = on this device, dashed = cloud. Shape, not hue, carries the route. */
@Composable
fun RouteGlyph(mode: PrivacyMode, color: Color, modifier: Modifier = Modifier) {
    Canvas(modifier.size(width = 24.dp, height = 8.dp)) {
        val y = size.height / 2
        val w = size.width
        val stroke = 2.6.dp.toPx()
        val dash = PathEffect.dashPathEffect(floatArrayOf(3.dp.toPx(), 3.5.dp.toPx()))
        when (mode) {
            PrivacyMode.LOCAL_ONLY -> drawLine(color, Offset(1f, y), Offset(w - 1f, y), stroke, StrokeCap.Round)
            PrivacyMode.CLOUD -> drawLine(color, Offset(1f, y), Offset(w - 1f, y), stroke, StrokeCap.Round, dash)
            PrivacyMode.HYBRID -> {
                drawLine(color, Offset(1f, y), Offset(w * 0.45f, y), stroke, StrokeCap.Round)
                drawLine(color, Offset(w * 0.6f, y), Offset(w - 1f, y), stroke, StrokeCap.Round, dash)
            }
        }
    }
}

@Composable
fun RouteSwitch(mode: PrivacyMode, onChange: (PrivacyMode) -> Unit, modifier: Modifier = Modifier) {
    Row(
        modifier.fillMaxWidth().clip(RoundedCornerShape(14.dp)).background(Dock.Surface).padding(4.dp).semantics { contentDescription = "Privacy mode" },
        horizontalArrangement = Arrangement.spacedBy(4.dp),
    ) {
        PrivacyMode.entries.forEach { m ->
            val on = m == mode
            Row(
                Modifier.weight(1f).defaultMinSize(minHeight = 44.dp).clip(RoundedCornerShape(10.dp))
                    .background(if (on) Dock.Accent else Color.Transparent)
                    .clickable(role = Role.RadioButton) { onChange(m) }.padding(horizontal = 6.dp),
                horizontalArrangement = Arrangement.Center, verticalAlignment = Alignment.CenterVertically,
            ) {
                RouteGlyph(m, if (on) Dock.OnAccent else Dock.Muted)
                Spacer(Modifier.width(6.dp))
                Text(m.label, style = if (on) Type.bodyBold.copy(color = Dock.OnAccent, fontSize = 14.sp) else Type.body.copy(color = Dock.Muted, fontSize = 14.sp), maxLines = 1)
            }
        }
    }
}

fun Modifier.dashedBorder(color: Color, radius: Dp = 8.dp, width: Dp = 2.dp) = drawBehind {
    val r = radius.toPx()
    drawRoundRect(color, cornerRadius = CornerRadius(r, r), style = Stroke(width.toPx(), pathEffect = PathEffect.dashPathEffect(floatArrayOf(5.dp.toPx(), 4.dp.toPx()))))
}

/** Where the answer was produced, read from the SDK's inferenceSource. */
@Composable
fun SourceBadge(source: Source, onPaper: Boolean = false) {
    val ink = if (onPaper) Dock.PaperInk else Dock.Text
    val shape = RoundedCornerShape(8.dp)
    val mod = if (source == Source.ON_DEVICE) Modifier.clip(shape).background(ink) else Modifier.dashedBorder(ink)
    Row(mod.padding(horizontal = 10.dp, vertical = 6.dp), verticalAlignment = Alignment.CenterVertically) {
        RouteGlyph(if (source == Source.ON_DEVICE) PrivacyMode.LOCAL_ONLY else PrivacyMode.CLOUD, if (source == Source.ON_DEVICE) (if (onPaper) Dock.Paper else Dock.Bg) else ink, Modifier.width(18.dp))
        Spacer(Modifier.width(6.dp))
        Text(source.label, style = Type.bodyBold.copy(fontSize = 13.sp, color = if (source == Source.ON_DEVICE) (if (onPaper) Dock.Paper else Dock.Bg) else ink))
    }
}

fun decisionColor(d: Decision, onPaper: Boolean) = when (d) {
    Decision.ALLOW -> if (onPaper) Dock.PaperGo else Dock.Go
    Decision.DENY -> if (onPaper) Dock.PaperStop else Dock.Stop
    Decision.REQUIRE_APPROVAL -> if (onPaper) Dock.PaperHold else Dock.Hold
    Decision.NEED_MORE_INFORMATION -> if (onPaper) Dock.PaperInfo else Dock.Info
}

/** A policy decision lands on the case as a rubber stamp. */
@Composable
fun Stamp(decision: Decision, large: Boolean = false, onPaper: Boolean = false, animateKey: Any? = null) {
    val color = decisionColor(decision, onPaper)
    val scale = remember { Animatable(1f) }
    LaunchedEffect(animateKey) {
        if (large && animateKey != null) {
            scale.snapTo(2.2f)
            scale.animateTo(1f, spring(dampingRatio = Spring.DampingRatioMediumBouncy, stiffness = Spring.StiffnessMedium))
        }
    }
    val label = decision.name.replace('_', ' ')
    Box(
        Modifier.rotate(if (large) -7f else -1.5f).scale(scale.value).alpha(if (large) 0.92f else 1f)
            .border(if (large) 3.dp else 2.dp, color, RoundedCornerShape(4.dp)).padding(1.5.dp).border(1.dp, color, RoundedCornerShape(3.dp))
            .padding(horizontal = if (large) 12.dp else 7.dp, vertical = if (large) 3.dp else 1.dp)
            .semantics { contentDescription = "Policy decision: $label" },
    ) {
        Text(label, style = Type.display.copy(fontSize = if (large) 24.sp else 12.sp, lineHeight = if (large) 28.sp else 16.sp, color = color, letterSpacing = 0.8.sp), maxLines = 1)
    }
}

@Composable
fun Chip(text: String, color: Color = Dock.Muted, filled: Boolean = false) {
    Text(
        text,
        style = Type.label.copy(color = if (filled) Dock.OnAccent else color),
        modifier = Modifier.clip(RoundedCornerShape(6.dp)).then(if (filled) Modifier.background(color) else Modifier.border(1.dp, color.copy(alpha = 0.6f), RoundedCornerShape(6.dp))).padding(horizontal = 8.dp, vertical = 3.dp),
        maxLines = 1,
    )
}

@Composable
fun PrimaryButton(text: String, onClick: () -> Unit, modifier: Modifier = Modifier, enabled: Boolean = true) {
    Box(
        modifier.defaultMinSize(minHeight = 50.dp).clip(RoundedCornerShape(12.dp)).background(if (enabled) Dock.Accent else Dock.Accent.copy(alpha = 0.4f))
            .clickable(enabled = enabled, role = Role.Button, onClick = onClick).padding(horizontal = 18.dp),
        contentAlignment = Alignment.Center,
    ) { Text(text, style = Type.bodyBold.copy(color = Dock.OnAccent, fontSize = 16.sp), textAlign = TextAlign.Center) }
}

@Composable
fun GhostButton(text: String, onClick: () -> Unit, modifier: Modifier = Modifier, enabled: Boolean = true, color: Color = Dock.Text) {
    Box(
        modifier.defaultMinSize(minHeight = 46.dp).clip(RoundedCornerShape(12.dp)).border(1.dp, if (enabled) Dock.Line else Dock.Line.copy(alpha = 0.4f), RoundedCornerShape(12.dp))
            .clickable(enabled = enabled, role = Role.Button, onClick = onClick).padding(horizontal = 14.dp),
        contentAlignment = Alignment.Center,
    ) { Text(text, style = Type.body.copy(color = if (enabled) color else Dock.Muted.copy(alpha = 0.5f)), textAlign = TextAlign.Center) }
}

/** A dark panel on the desk. */
@Composable
fun Panel(modifier: Modifier = Modifier, padding: PaddingValues = PaddingValues(16.dp), content: @Composable ColumnScope.() -> Unit) {
    Column(modifier.fillMaxWidth().clip(RoundedCornerShape(18.dp)).background(Dock.Surface).border(1.dp, Dock.Line.copy(alpha = 0.5f), RoundedCornerShape(18.dp)).padding(padding), content = content)
}

/** The docket: a paper case sheet with a perforated tear-off edge, lying on the dark desk. */
@Composable
fun Docket(modifier: Modifier = Modifier, content: @Composable ColumnScope.() -> Unit) {
    Column(
        modifier.fillMaxWidth().padding(top = 6.dp)
            .drawBehind {
                drawRoundRect(Dock.Paper, cornerRadius = CornerRadius(5.dp.toPx(), 5.dp.toPx()))
                val step = 12.dp.toPx()
                var x = step / 2
                while (x < size.width) {
                    drawCircle(Dock.Bg, radius = 3.4.dp.toPx(), center = Offset(x, 0f))
                    x += step
                }
            }
            .padding(start = 18.dp, end = 18.dp, top = 20.dp, bottom = 18.dp),
        content = content,
    )
}

@Composable
fun DashedRule(color: Color = Dock.PaperLine) {
    Canvas(Modifier.fillMaxWidth().height(1.dp)) {
        drawLine(color, Offset(0f, 0f), Offset(size.width, 0f), 1.dp.toPx(), pathEffect = PathEffect.dashPathEffect(floatArrayOf(4.dp.toPx(), 3.dp.toPx())))
    }
}

/** Numbered step marker: the case really is a sequence (understand, check policy, authorize). */
@Composable
fun StepHeader(n: Int, title: String, trailing: @Composable () -> Unit = {}) {
    Row(verticalAlignment = Alignment.CenterVertically) {
        Box(Modifier.size(26.dp).clip(RoundedCornerShape(13.dp)).background(Dock.Accent), contentAlignment = Alignment.Center) {
            Text("$n", style = Type.bodyBold.copy(color = Dock.OnAccent, fontFamily = Figure, fontSize = 14.sp))
        }
        Spacer(Modifier.width(10.dp))
        Text(title, style = Type.title, modifier = Modifier.weight(1f))
        trailing()
    }
}

@Composable
fun KeyValue(key: String, value: String, valueColor: Color = Dock.Text) {
    Row(Modifier.fillMaxWidth().padding(vertical = 2.dp)) {
        Text(key, style = Type.small, modifier = Modifier.width(112.dp))
        Text(value, style = Type.body.copy(fontSize = 14.sp, color = valueColor), modifier = Modifier.weight(1f))
    }
}
