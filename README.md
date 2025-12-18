'use client';

/**
 * NOTE:
 * This file honestly got bigger than planned.
 * I kept it as a single file for now because splitting it
 * while the feature is still moving caused more confusion than help.
 * Might refactor later when things stabilize.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import axios, { AxiosError } from 'axios';
import {
  Box,
  Button,
  Card,
  CardActions,
  CardContent,
  CardMedia,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogTitle,
  Stack,
  Typography,
} from '@mui/material';
import {
  QueryClient,
  QueryClientProvider,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { FixedSizeGrid } from 'react-window';
import { Stage, Layer, Rect, Image as KonvaImage } from 'react-konva';

/* ============================== API SETUP ============================== */

// Using axios here mainly because we already rely on interceptors
// in other parts of the app. Keeping it consistent.
const api = axios.create({
  baseURL:
    process.env.NEXT_PUBLIC_API_URL ||
    'https://my-json-server.typicode.com/MostafaKMilly/demo',
  timeout: 8000,
  headers: { 'Content-Type': 'application/json' },
});

// This helper exists because error handling started getting duplicated.
// Not perfect, but better than inline checks everywhere.
function getApiError(error: unknown): string {
  if (error instanceof AxiosError) {
    return error.response?.data?.message || error.message;
  }

  return 'Something went wrong';
}

/* ============================== TYPES ============================== */

interface ImageItem {
  id: number;
  title: string;
  url: string;
}

// TODO: annotations probably need a label later
// TODO: colors would also be useful
interface Annotation {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

/* ============================== DATA ============================== */

async function fetchImages(): Promise<ImageItem[]> {
  const { data } = await api.get('/images');

  // Had an issue once where the API returned an object instead of array
  // Keeping this guard to avoid silent crashes.
  if (!Array.isArray(data)) {
    throw new Error('Images response is not an array');
  }

  return data;
}

async function deleteImageRequest(id: number): Promise<void> {
  await api.delete(`/images/${id}`);
}

// Image-related logic lives here to avoid bloating the page component.
function useImages() {
  const queryClient = useQueryClient();

  const imagesQuery = useQuery({
    queryKey: ['images'],
    queryFn: fetchImages,
    staleTime: 60_000,

    // Retrying more than this felt useless in practice
    retry: (count) => count < 2,
  });

  const deleteImage = useMutation({
    mutationFn: deleteImageRequest,

    // Optimistic update makes the UI feel much faster.
    // Downside: rollback logic is needed.
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: ['images'] });

      const previous = queryClient.getQueryData<ImageItem[]>(['images']);

      queryClient.setQueryData<ImageItem[]>(['images'], old =>
        old ? old.filter(img => img.id !== id) : []
      );

      return { previous };
    },

    onError: (_err, _id, ctx) => {
      // Roll back if the delete failed
      if (ctx?.previous) {
        queryClient.setQueryData(['images'], ctx.previous);
      }
    },

    // Always refetch — backend is source of truth
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['images'] });
    },
  });

  return { imagesQuery, deleteImage };
}

/* ============================== ANNOTATIONS ============================== */

function useAnnotations() {
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const counterRef = useRef(0);

  const addAnnotation = useCallback(() => {
    counterRef.current += 1;

    // Offset annotations slightly so they don't stack perfectly
    const offset = counterRef.current * 6;

    setAnnotations(prev => [
      ...prev,
      {
        id: crypto.randomUUID(),
        x: 50 + offset,
        y: 50 + offset,
        width: 160,
        height: 100,
      },
    ]);
  }, []);

  return { annotations, addAnnotation };
}

/* ============================== UI ============================== */

function ConfirmDialog({
  open,
  onConfirm,
  onClose,
}: {
  open: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <Dialog open={open} onClose={onClose}>
      <DialogTitle>
        Confirm delete
        <Typography variant="caption" display="block">
          This action cannot be undone
        </Typography>
      </DialogTitle>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button color="error" onClick={onConfirm}>
          Delete
        </Button>
      </DialogActions>
    </Dialog>
  );
}

function ImageCard({
  image,
  onDelete,
}: {
  image: ImageItem;
  onDelete: () => void;
}) {
  return (
    <Card>
      <CardMedia component="img" height="160" image={image.url} />
      <CardContent>
        <Typography variant="subtitle2" noWrap>
          {image.title}
        </Typography>
      </CardContent>
      <CardActions>
        <Button size="small" color="error" onClick={onDelete}>
          Delete
        </Button>
      </CardActions>
    </Card>
  );
}

function ImageGallery({
  items,
  onDelete,
}: {
  items: ImageItem[];
  onDelete: (id: number) => void;
}) {
  const columnCount = 3;
  const columnWidth = 300;
  const rowHeight = 240;

  return (
    <FixedSizeGrid
      columnCount={columnCount}
      columnWidth={columnWidth}
      height={600}
      rowCount={Math.ceil(items.length / columnCount)}
      rowHeight={rowHeight}
      width={columnWidth * columnCount}
    >
      {({ columnIndex, rowIndex, style }) => {
        const index = rowIndex * columnCount + columnIndex;
        const image = items[index];

        if (!image) return null;

        return (
          <Box style={style} p={1}>
            <ImageCard image={image} onDelete={() => onDelete(image.id)} />
          </Box>
        );
      }}
    </FixedSizeGrid>
  );
}

function AnnotationCanvas({ src }: { src: string }) {
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const { annotations, addAnnotation } = useAnnotations();

  useEffect(() => {
    let cancelled = false;

    const image = new Image();
    image.src = src;
    image.onload = () => {
      if (!cancelled) setImg(image);
    };

    return () => {
      cancelled = true;
    };
  }, [src]);

  if (!img) return null;

  return (
    <Stack spacing={2}>
      <Button variant="outlined" onClick={addAnnotation}>
        Add annotation
      </Button>

      <Stage width={800} height={600}>
        <Layer>
          <KonvaImage image={img} />
          {annotations.map(a => (
            <Rect key={a.id} {...a} stroke="#ff1744" strokeWidth={2} draggable />
          ))}
        </Layer>
      </Stage>
    </Stack>
  );
}

/* ============================== PAGE ============================== */

function PageContent() {
  const { imagesQuery, deleteImage } = useImages();
  const [selectedId, setSelectedId] = useState<number | null>(null);

  if (imagesQuery.isLoading) {
    return (
      <Box display="flex" justifyContent="center" mt={8}>
        <CircularProgress />
      </Box>
    );
  }

  if (imagesQuery.isError || !imagesQuery.data) {
    return (
      <Typography align="center" mt={8} color="error">
        {getApiError(imagesQuery.error)}
      </Typography>
    );
  }

  return (
    <>
      <ImageGallery items={imagesQuery.data} onDelete={setSelectedId} />

      <ConfirmDialog
        open={selectedId !== null}
        onClose={() => setSelectedId(null)}
        onConfirm={() => {
          if (selectedId !== null) {
            deleteImage.mutate(selectedId);
            setSelectedId(null);
          }
        }}
      />

      {imagesQuery.data[0] && (
        <Box mt={6}>
          <Typography variant="h6" mb={2}>
            Annotation playground
          </Typography>
          <AnnotationCanvas src={imagesQuery.data[0].url} />
        </Box>
      )}
    </>
  );
}

/* ============================== ROOT ============================== */

const queryClient = new QueryClient();

export default function Page() {
  return (
    <QueryClientProvider client={queryClient}>
      <Box p={4}>
        <Typography variant="h4" mb={4}>
          Image Manager
        </Typography>
        <PageContent />
      </Box>
    </QueryClientProvider>
  );
}
