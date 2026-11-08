import { PageCurl, type PageCurlHandle } from '@pagecurl/react-native';
import { StatusBar } from 'expo-status-bar';
import { type ReactNode, useRef, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';

const SERIF = Platform.select({ ios: 'Georgia', default: 'serif' });
const PAPER = '#fbfaf6';
const CLOTH = '#1c2742';
const GILT = '#d9b46c';
const INK = '#2a2723';

const CHAPTERS = [
  {
    title: 'Of Paper',
    text: [
      'A page is a thin thing that remembers being a tree. It bends before it folds, and it folds before it tears, and a reader feels each of these through the fingertips long before the eye has finished the line.',
      'Drag a corner and the leaf lifts along a curve, the back of the sheet catching the light while its shadow falls across the page beneath.',
    ],
  },
  {
    title: 'Of Ink',
    text: [
      'Ink sits on the surface and sinks into it at once. Good ink is black without being heavy, and it stays where the press put it, through every turn of the leaf.',
      'The curl is drawn from a picture of this very page, so whatever you put here, from type to buttons to images, turns with it.',
    ],
  },
  {
    title: 'Of Type',
    text: [
      'Type is speech made still. A well set page has an even colour from across the room and a clear voice from close up.',
      'Tap near an edge to turn, or take hold of the page anywhere and pull it over.',
    ],
  },
  {
    title: 'Of the Book',
    text: [
      'A book is a stack of pages held at one edge, and everything else follows from that: the spine, the gutter, the way a leaf falls open.',
      'On a wide screen the pages sit side by side as a spread, the way a book lies open on a desk.',
    ],
  },
];

function Paper({ children, folio }: { children: ReactNode; folio?: number }) {
  return (
    <View style={styles.paper}>
      {children}
      {folio !== undefined ? <Text style={styles.folio}>{folio}</Text> : null}
    </View>
  );
}

export default function App() {
  const book = useRef<PageCurlHandle>(null);
  const [page, setPage] = useState(0);
  const [taps, setTaps] = useState(0);
  const { width, height } = useWindowDimensions();
  const spread = width > height;

  const pages = [
    <View key="cover" style={[styles.paper, styles.cover]}>
      <View style={styles.frame}>
        <Text style={styles.coverTitle}>THE TURNING</Text>
        <Text style={styles.coverSub}>of Pages</Text>
        <View style={styles.rule} />
        <Text style={styles.press}>PAGECURL PRESS</Text>
      </View>
    </View>,
    <Paper key="title">
      <View style={styles.centre}>
        <Text style={styles.titleCaps}>THE TURNING</Text>
        <Text style={styles.titleItalic}>of Pages</Text>
        <Text style={styles.small}>A short book about turning them</Text>
      </View>
    </Paper>,
    ...CHAPTERS.map((c, i) => (
      <Paper key={c.title} folio={i + 1}>
        <Text style={styles.chapterNo}>CHAPTER {['I', 'II', 'III', 'IV'][i]}</Text>
        <Text style={styles.chapter}>{c.title}</Text>
        {c.text.map((t) => (
          <Text key={t.slice(0, 12)} style={styles.body}>
            {t}
          </Text>
        ))}
        {i === 1 ? (
          <Pressable style={styles.button} onPress={() => setTaps((n) => n + 1)}>
            <Text style={styles.buttonText}>Pressed {taps} times</Text>
          </Pressable>
        ) : null}
      </Paper>
    )),
    <Paper key="end">
      <View style={styles.centre}>
        <Text style={styles.titleItalic}>Finis</Text>
      </View>
    </Paper>,
  ];

  return (
    <View style={styles.screen}>
      <StatusBar style="dark" />
      <PageCurl
        ref={book}
        style={styles.book}
        spread={spread}
        pageColor={PAPER}
        page={page}
        onPageChange={setPage}
      >
        {pages}
      </PageCurl>
      <View style={styles.bar}>
        <Pressable onPress={() => book.current?.prev()} hitSlop={12}>
          <Text style={styles.barText}>‹ Prev</Text>
        </Pressable>
        <Text style={styles.barText}>
          {page + 1} / {pages.length}
        </Text>
        <Pressable onPress={() => book.current?.next()} hitSlop={12}>
          <Text style={styles.barText}>Next ›</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#e9e7e1', paddingTop: 60, paddingBottom: 24 },
  book: { flex: 1, marginHorizontal: 16 },
  paper: { flex: 1, backgroundColor: PAPER, paddingHorizontal: 30, paddingVertical: 44 },
  cover: { backgroundColor: CLOTH, padding: 18 },
  frame: {
    flex: 1,
    borderWidth: 1,
    borderColor: GILT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  coverTitle: { fontFamily: SERIF, color: GILT, fontSize: 26, letterSpacing: 3 },
  coverSub: { fontFamily: SERIF, color: GILT, fontSize: 28, fontStyle: 'italic', marginTop: 6 },
  rule: { width: 80, height: 1, backgroundColor: GILT, marginVertical: 28 },
  press: { fontFamily: SERIF, color: GILT, fontSize: 10, letterSpacing: 3 },
  centre: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  titleCaps: { fontFamily: SERIF, color: INK, fontSize: 22, letterSpacing: 3 },
  titleItalic: { fontFamily: SERIF, color: INK, fontSize: 26, fontStyle: 'italic', marginTop: 4 },
  small: { fontFamily: SERIF, color: '#7a746b', fontSize: 13, marginTop: 24 },
  chapterNo: { fontFamily: SERIF, color: '#9a3b2e', fontSize: 11, letterSpacing: 2.5 },
  chapter: { fontFamily: SERIF, color: INK, fontSize: 30, marginTop: 8, marginBottom: 22 },
  body: { fontFamily: SERIF, color: INK, fontSize: 16, lineHeight: 24, marginBottom: 14 },
  folio: {
    position: 'absolute',
    bottom: 22,
    alignSelf: 'center',
    fontFamily: SERIF,
    color: '#7a746b',
  },
  button: {
    alignSelf: 'flex-start',
    marginTop: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 18,
    backgroundColor: CLOTH,
  },
  buttonText: { color: '#fff', fontSize: 14 },
  bar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 28,
    paddingTop: 14,
  },
  barText: { fontFamily: SERIF, color: INK, fontSize: 16 },
});
