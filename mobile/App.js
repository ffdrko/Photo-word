import { StatusBar } from 'expo-status-bar';
import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Button,
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { ocrImage, formatBlocks, exportDocx, API_URL } from './api';
import { ocrOnDevice, isUnavailableError } from './onDeviceOcr';

// Recognition accuracy plateaus well below full sensor resolution, but time
// scales with pixel count, so shrink before doing any work.
const MAX_EDGE = 2000;

async function downscale(uri) {
  try {
    const { uri: out } = await ImageManipulator.manipulateAsync(
      uri,
      [{ resize: { width: MAX_EDGE } }],
      { compress: 0.85, format: ImageManipulator.SaveFormat.JPEG }
    );
    return out;
  } catch {
    return uri; // not worth failing the whole run over
  }
}

export default function App() {
  const [images, setImages] = useState([]); // [{ uri }]
  const [rawText, setRawText] = useState('');
  const [layoutLines, setLayoutLines] = useState([]);
  const [textEdited, setTextEdited] = useState(false);
  const [blocks, setBlocks] = useState([]);
  const [title, setTitle] = useState('My Notes');
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');

  // ---- Pick / capture images ----
  async function pickImage(useCamera = false) {
    const perm = useCamera
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Permission needed', 'Please grant access to continue.');
      return;
    }
    const result = useCamera
      ? await ImagePicker.launchCameraAsync({ quality: 0.8 })
      : await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ImagePicker.MediaTypeOptions.Images,
          quality: 0.8,
          allowsMultipleSelection: true,
        });
    if (result.canceled) return;
    const resized = await Promise.all(result.assets.map((a) => downscale(a.uri)));
    setImages((prev) => [...prev, ...resized.map((uri) => ({ uri }))]);
  }

  function removeImage(index) {
    setImages((prev) => prev.filter((_, i) => i !== index));
  }

  // ---- OCR all images sequentially (on-device first, server fallback) ----
  async function ocrSingle(uri) {
    try {
      return await ocrOnDevice(uri);
    } catch (e) {
      // Only fall back when the native module is genuinely missing. Swallowing
      // every error here would silently downgrade quality to hide real bugs.
      if (!isUnavailableError(e)) throw e;
      return ocrImage(uri);
    }
  }

  async function runOcr() {
    if (!images.length) return;
    setBusy(true);
    setRawText('');
    setLayoutLines([]);
    setTextEdited(false);
    const confidences = [];
    const enginesUsed = new Set();
    const allLines = [];
    const texts = [];
    try {
      for (let i = 0; i < images.length; i++) {
        setStatus(`OCR: image ${i + 1} of ${images.length}…`);
        const page = await ocrSingle(images[i].uri);
        enginesUsed.add(page.engine);
        if (typeof page.confidence === 'number') confidences.push(page.confidence);
        texts.push(page.rawText);
        // Namespace block ids per page so lines from different photos are never
        // merged into one paragraph.
        for (const line of page.lines || []) {
          allLines.push({ ...line, block: `${i}:${line.block}` });
        }
      }
      setRawText(texts.join('\n\n'));
      setLayoutLines(allLines);
      const avg = confidences.length
        ? Math.round((confidences.reduce((a, b) => a + b, 0) / confidences.length) * 100)
        : null;
      const engineLabel = [...enginesUsed]
        .map((e) => (e === 'on-device' ? 'on-device (ML Kit)' : 'server (Tesseract)'))
        .join(' + ');
      setStatus(`Done via ${engineLabel}${avg !== null ? ` — confidence ${avg}%` : ''}`);
    } catch (e) {
      setStatus('');
      Alert.alert('OCR failed', e.message);
    } finally {
      setBusy(false);
    }
  }

  // ---- Format ----
  async function runFormat() {
    if (!rawText.trim()) return;
    setBusy(true);
    try {
      // Editing the text invalidates the line boxes, so only send geometry
      // while the recognized text is untouched.
      const useLayout = !textEdited && layoutLines.length > 0;
      const result = await formatBlocks(useLayout ? { lines: layoutLines } : { rawText });
      setBlocks(result);
      setStatus(`Formatted into ${result.length} blocks${useLayout ? ' using layout' : ''}`);
    } catch (e) {
      Alert.alert('Formatting failed', e.message);
    } finally {
      setBusy(false);
    }
  }

  // ---- Export & share .docx ----
  async function runExport() {
    if (!blocks.length) return;
    setBusy(true);
    try {
      const safeName = title.replace(/[^a-z0-9 _-]/gi, '').trim() || 'notes';
      const fileUri = `${FileSystem.cacheDirectory}${safeName}.docx`;
      await exportDocx(blocks, title, fileUri);
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(fileUri, {
          mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          dialogTitle: 'Share your Word document',
        });
      } else {
        Alert.alert('Saved', `Document saved to:\n${fileUri}`);
      }
      setStatus('Exported!');
    } catch (e) {
      Alert.alert('Export failed', e.message);
    } finally {
      setBusy(false);
    }
  }

  function reset() {
    setImages([]);
    setRawText('');
    setLayoutLines([]);
    setTextEdited(false);
    setBlocks([]);
    setStatus('');
  }

  // ---- Render helpers ----
  // Numbered items count from the start of their own run, not from the block
  // index, so a list further down the document still begins at 1.
  const listNumbers = blocks.reduce((acc, b, i) => {
    acc[i] = b.type === 'numbered' ? (acc[i - 1] || 0) + 1 : 0;
    return acc;
  }, {});

  function renderBlock(b, i) {
    if (b.type === 'heading1') return <Text key={i} style={s.h1}>{b.text}</Text>;
    if (b.type === 'heading2') return <Text key={i} style={s.h2}>{b.text}</Text>;
    if (b.type === 'heading3') return <Text key={i} style={s.h3}>{b.text}</Text>;
    const runsText = (b.runs || []).map((r) => r.text).join('');
    if (b.type === 'bullet') return <Text key={i} style={s.bullet}>•  {runsText}</Text>;
    if (b.type === 'numbered')
      return <Text key={i} style={s.bullet}>{listNumbers[i]}.  {runsText}</Text>;
    return (
      <Text key={i} style={s.p}>
        {(b.runs || []).map((r, j) => (
          <Text key={j} style={[r.bold && s.bold, r.italic && s.italic]}>{r.text}</Text>
        ))}
      </Text>
    );
  }

  return (
    <KeyboardAvoidingView style={s.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <StatusBar style="auto" />
      <ScrollView contentContainerStyle={s.container}>
        <Text style={s.logo}>📸 SnapNote</Text>
        <Text style={s.tagline}>Photo → OCR → Word document</Text>
        <Text style={s.apiNote}>API: {API_URL}</Text>

        {/* Step 1 */}
        <View style={s.card}>
          <Text style={s.stepTitle}>1. Add photos ({images.length})</Text>
          <View style={s.row}>
            <Button title="📷 Camera" onPress={() => pickImage(true)} disabled={busy} />
            <Button title="🖼 Gallery" onPress={() => pickImage(false)} disabled={busy} />
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.thumbRow}>
            {images.map((img, i) => (
              <View key={i} style={s.thumbWrap}>
                <Image source={{ uri: img.uri }} style={s.thumb} />
                <Text style={s.removeBtn} onPress={() => removeImage(i)}>✕</Text>
              </View>
            ))}
          </ScrollView>
          {images.length > 0 && (
            <View style={s.btnWrap}>
              <Button title="🔍 Extract text (OCR)" onPress={runOcr} disabled={busy} />
            </View>
          )}
        </View>

        {/* Step 2 */}
        {!!(rawText || status) && (
          <View style={s.card}>
            <Text style={s.stepTitle}>2. Review text</Text>
            {status ? <Text style={s.status}>{status}</Text> : null}
            <TextInput
              style={s.textarea}
              multiline
              value={rawText}
              onChangeText={(t) => { setRawText(t); setTextEdited(true); }}
              placeholder="Extracted text appears here…"
            />
            <View style={s.btnWrap}>
              <Button title="✨ Format" onPress={runFormat} disabled={busy || !rawText.trim()} />
            </View>
          </View>
        )}

        {/* Step 3 */}
        {blocks.length > 0 && (
          <View style={s.card}>
            <Text style={s.stepTitle}>3. Preview & export</Text>
            <TextInput style={s.input} value={title} onChangeText={setTitle} placeholder="Document title" />
            <View style={s.preview}>{blocks.map(renderBlock)}</View>
            <View style={s.row}>
              <Button title="⬇️ Export .docx" onPress={runExport} disabled={busy} />
              <Button title="Start over" onPress={reset} disabled={busy} color="#888" />
            </View>
          </View>
        )}

        {busy && <ActivityIndicator size="large" style={s.spinner} />}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#f5f7fa' },
  container: { padding: 16, paddingBottom: 40 },
  logo: { fontSize: 28, fontWeight: 'bold', textAlign: 'center' },
  tagline: { textAlign: 'center', color: '#64748b', marginBottom: 4 },
  apiNote: { textAlign: 'center', color: '#94a3b8', fontSize: 11, marginBottom: 12 },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 14,
    gap: 10,
    elevation: 2,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 3,
  },
  stepTitle: { fontSize: 16, fontWeight: '600' },
  row: { flexDirection: 'row', gap: 10, justifyContent: 'space-around' },
  btnWrap: { marginTop: 4 },
  thumbRow: { flexDirection: 'row' },
  thumbWrap: { marginRight: 8 },
  thumb: { width: 90, height: 90, borderRadius: 8, backgroundColor: '#eee' },
  removeBtn: {
    position: 'absolute', top: -6, right: -6,
    backgroundColor: '#ef4444', color: '#fff',
    width: 20, height: 20, borderRadius: 10,
    textAlign: 'center', lineHeight: 20, overflow: 'hidden',
  },
  status: { color: '#4f46e5', fontSize: 13 },
  textarea: {
    borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 8,
    minHeight: 120, padding: 10, textAlignVertical: 'top', fontSize: 14,
  },
  input: {
    borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 8,
    padding: 10, fontSize: 14,
  },
  preview: { gap: 6 },
  h1: { fontSize: 22, fontWeight: 'bold' },
  h2: { fontSize: 18, fontWeight: 'bold' },
  h3: { fontSize: 15, fontWeight: '600', color: '#64748b' },
  p: { fontSize: 14, lineHeight: 22 },
  bullet: { fontSize: 14, lineHeight: 22, marginLeft: 8 },
  bold: { fontWeight: 'bold' },
  italic: { fontStyle: 'italic' },
  spinner: { marginTop: 8 },
});
