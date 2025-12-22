'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import axios, { AxiosError } from 'axios';

/* ======================= MUI SETUP ======================= */
import { CacheProvider } from '@emotion/react';
import createCache from '@emotion/cache';
import {
  ThemeProvider,
  createTheme,
  CssBaseline,
  Box,
  Button,
  Card,
  CardActions,
  CardContent,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogTitle,
  Stack,
  Typography,
  MenuItem,
  Select,
  SelectChangeEvent,
} from '@mui/material';

/* ======================= LIBS ======================= */
import {
  QueryClient,
  QueryClientProvider,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { FixedSizeGrid } from 'react-window';
import { Stage, Layer, Rect, Image as KonvaImage } from 'react-konva';

/* ======================= THEME ======================= */
const emotionCache = createCache({ key: 'mui', prepend: true });

const theme = createTheme({
  palette: {
    primary: { main: '#2979ff' },
    secondary: { main: '#ff1744' },
  },
});

/* ======================= API ======================= */
const api = axios.create({
  baseURL:
    process.env.NEXT_PUBLIC_API_URL ||
    'https://my-json-server.typicode.com/MostafaKMilly/demo',
  timeout: 8000,
  headers: { 'Content-Type': 'application/json' },
});

function getApiError(error: unknown): string {
  if (error instanceof AxiosError)
    return error.response?.data?.message || error.message;
  return 'Unexpected error';
}

/* ======================= TYPES ======================= */
interface ImageItem {
  id: number;
  title: string;
  url: string;
}

interface Annotation {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  color: string;
}

/* ======================= DATA ======================= */
async function fetchImages(): Promise<ImageItem[]> {
  const { data } = await api.get('/images');
  return data;
}

async function deleteImageRequest(id: number) {
  await api.delete(`/images/${id}`);
}

/* ======================= HOOKS ======================= */
function useImages() {
  const queryClient = useQueryClient();

  const imagesQuery = useQuery({
    queryKey: ['images'],
    queryFn: fetchImages,
  });

  const deleteImage = useMutation({
    mutationFn: deleteImageRequest,
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: ['images'] });
      const prev = queryClient.getQueryData<ImageItem[]>(['images']);
      queryClient.setQueryData<ImageItem[]>(['images'], old =>
        old?.filter(i => i.id !== id)
      );
      return { prev };
    },
    onError: (_e, _id, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(['images'], ctx.prev);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['images'] }),
  });

  return { imagesQuery, deleteImage };
}

function useAnnotations(imageId: number) {
  const [annotations, setAnnotations] = useState<Annotation[]>([]);

  useEffect(() => {
    const saved = localStorage.getItem(`ann_${imageId}`);
    if (saved) setAnnotations(JSON.parse(saved));
  }, [imageId]);

  useEffect(() => {
    localStorage.setItem(`ann_${imageId}`, JSON.stringify(annotations));
  }, [annotations, imageId]);

  const addAnnotation = (color: string) => {
    setAnnotations(prev => [
      ...prev,
      {
        id: `${Date.now()}-${Math.random()}`,
        x: 60,
        y: 60,
        width: 160,
        height: 100,
        color,
      },
    ]);
  };

  const removeAnnotation = (id: string) => {
    setAnnotations(prev => prev.filter(a => a.id !== id));
  };

  return { annotations, addAnnotation, removeAnnotation, setAnnotations };
}

/* ======================= UI ======================= */
function ConfirmDialog({
  open,
  onClose,
  onConfirm,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <Dialog open={open} onClose={onClose}>
      <DialogTitle>Delete this image?</DialogTitle>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button color="error" onClick={onConfirm}>Delete</Button>
      </DialogActions>
    </Dialog>
  );
}

function AnnotationCanvas({ image }: { image: ImageItem }) {
  const [color, setColor] = useState('#ff1744');
  const { annotations, addAnnotation, removeAnnotation, setAnnotations } =
    useAnnotations(image.id);
  const [img, setImg] = useState<HTMLImageElement | null>(null);

  useEffect(() => {
    const i = new Image();
    i.src = image.url;
    i.onload = () => setImg(i);
  }, [image.url]);

  if (!img) return null;

  return (
    <Stack spacing={2}>
      <Stack direction="row" spacing={2}>
        <Button onClick={() => addAnnotation(color)} variant="contained">
          Add Annotation
        </Button>
        <Select value={color} size="small"
          onChange={(e: SelectChangeEvent) => setColor(e.target.value)}>
          <MenuItem value="#ff1744">Red</MenuItem>
          <MenuItem value="#2979ff">Blue</MenuItem>
          <MenuItem value="#00c853">Green</MenuItem>
        </Select>
      </Stack>

      <Stage width={800} height={500}>
        <Layer>
          <KonvaImage image={img} />
          {annotations.map(a => (
            <Rect
              key={a.id}
              {...a}
              stroke={a.color}
              strokeWidth={3}
              draggable
              onDblClick={() => removeAnnotation(a.id)}
              onDragEnd={e => {
                setAnnotations(prev =>
                  prev.map(p =>
                    p.id === a.id
                      ? { ...p, x: e.target.x(), y: e.target.y() }
                      : p
                  )
                );
              }}
            />
          ))}
        </Layer>
      </Stage>
    </Stack>
  );
}

/* ======================= PAGE ======================= */
const queryClient = new QueryClient();

function Content() {
  const { imagesQuery, deleteImage } = useImages();
  const [selected, setSelected] = useState<number | null>(null);

  if (imagesQuery.isLoading) return <CircularProgress />;

  if (imagesQuery.isError)
    return <Typography color="error">{getApiError(imagesQuery.error)}</Typography>;

  const first = imagesQuery.data?.[0];

  return (
    <>
      <ConfirmDialog
        open={selected !== null}
        onClose={() => setSelected(null)}
        onConfirm={() => {
          if (selected) deleteImage.mutate(selected);
          setSelected(null);
        }}
      />

      {first && <AnnotationCanvas image={first} />}

      <Box mt={4}>
        <FixedSizeGrid
          columnCount={3}
          columnWidth={260}
          rowCount={Math.ceil(imagesQuery.data!.length / 3)}
          rowHeight={180}
          width={780}
          height={400}
        >
          {({ columnIndex, rowIndex, style }) => {
            const i = rowIndex * 3 + columnIndex;
            const img = imagesQuery.data![i];
            if (!img) return null;
            return (
              <Box style={style} p={1}>
                <Card>
                  <CardContent>
                    <Typography>{img.title}</Typography>
                  </CardContent>
                  <CardActions>
                    <Button
                      color="error"
                      onClick={() => setSelected(img.id)}
                    >
                      Delete
                    </Button>
                  </CardActions>
                </Card>
              </Box>
            );
          }}
        </FixedSizeGrid>
      </Box>
    </>
  );
}

/* ======================= EXPORT ======================= */
export default function Page() {
  return (
    <CacheProvider value={emotionCache}>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <QueryClientProvider client={queryClient}>
          <Box p={4}>
            <Typography variant="h4" mb={3}>
              Image Manager
            </Typography>
            <Content />
          </Box>
        </QueryClientProvider>
      </ThemeProvider>
    </CacheProvider>
  );
}