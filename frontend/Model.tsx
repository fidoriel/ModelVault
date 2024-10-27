import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Download, Heart, MoreVertical, RefreshCcw, Bookmark } from "lucide-react";

import { useState, useEffect, useRef } from "react";
import { useParams } from "react-router-dom";
import { DetailedModelResponse } from "./bindings";
import { BACKEND_BASE_URL } from "./lib/api";
import { saveAs } from "file-saver";
import { ChevronLeft, ChevronRight } from "lucide-react";

import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { AspectRatio } from "./components/ui/aspect-ratio";

function OptionsDropdownMenu() {
    return (
        <DropdownMenu>
            <DropdownMenuTrigger>
                <MoreVertical className="h-5 w-5" />
            </DropdownMenuTrigger>
            <DropdownMenuContent>
                <DropdownMenuLabel>Model Options</DropdownMenuLabel>
                <DropdownMenuSeparator></DropdownMenuSeparator>
                <DropdownMenuItem>Edit</DropdownMenuItem>
                <DropdownMenuItem>Delete</DropdownMenuItem>
                <DropdownMenuItem>Compress</DropdownMenuItem>
                <DropdownMenuItem>Merge</DropdownMenuItem>
            </DropdownMenuContent>
        </DropdownMenu>
    );
}

function ImageGallery({ model }: { model: DetailedModelResponse }) {
    const [selectedImage, setSelectedImage] = useState<number>(0);
    const thumbnailsRef = useRef<HTMLDivElement>(null);

    const nextImage = () => {
        setSelectedImage((prev) => (prev + 1) % model.images.length);
    };

    const previousImage = () => {
        setSelectedImage((prev) => (prev - 1 + model.images.length) % model.images.length);
    };

    // Scroll selected thumbnail into view
    useEffect(() => {
        const thumbnailsContainer = thumbnailsRef.current;
        if (!thumbnailsContainer) return;

        const selectedThumbnail = thumbnailsContainer.children[selectedImage] as HTMLElement;
        if (!selectedThumbnail) return;

        const scrollLeft =
            selectedThumbnail.offsetLeft - thumbnailsContainer.offsetWidth / 2 + selectedThumbnail.offsetWidth / 2;
        thumbnailsContainer.scrollTo({
            left: scrollLeft,
            behavior: "smooth",
        });
    }, [selectedImage]);

    // Keyboard navigation
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === "ArrowLeft") {
                previousImage();
            } else if (e.key === "ArrowRight") {
                nextImage();
            }
        };

        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, []);

    const scrollThumbnails = (direction: "left" | "right") => {
        const thumbnailsContainer = thumbnailsRef.current;
        if (!thumbnailsContainer) return;

        const scrollAmount = 200; // Adjust this value to control scroll distance
        const newScrollLeft = thumbnailsContainer.scrollLeft + (direction === "left" ? -scrollAmount : scrollAmount);
        thumbnailsContainer.scrollTo({
            left: newScrollLeft,
            behavior: "smooth",
        });
    };

    return (
        <div className="w-full max-w-4xl">
            <Card className="mb-4 relative group">
                <CardContent className="p-0">
                    <AspectRatio ratio={4 / 3}>
                        <img
                            src={`${BACKEND_BASE_URL}${model.images[selectedImage]}`}
                            alt="Model Preview"
                            className="w-full h-full object-cover rounded-lg"
                        />
                    </AspectRatio>
                    <button
                        onClick={previousImage}
                        className="absolute left-2 top-1/2 -translate-y-1/2 bg-black/50 hover:bg-black/70 text-white rounded-full p-2 opacity-0 group-hover:opacity-100 transition-opacity"
                        aria-label="Previous image"
                    >
                        <ChevronLeft className="h-6 w-6" />
                    </button>
                    <button
                        onClick={nextImage}
                        className="absolute right-2 top-1/2 -translate-y-1/2 bg-black/50 hover:bg-black/70 text-white rounded-full p-2 opacity-0 group-hover:opacity-100 transition-opacity"
                        aria-label="Next image"
                    >
                        <ChevronRight className="h-6 w-6" />
                    </button>
                </CardContent>
            </Card>

            <div className="relative">
                <button
                    onClick={() => scrollThumbnails("left")}
                    className="absolute left-0 top-1/2 -translate-y-1/2 bg-black/50 hover:bg-black/70 text-white rounded-full p-1 z-10"
                    aria-label="Scroll thumbnails left"
                >
                    <ChevronLeft className="h-4 w-4" />
                </button>

                <div ref={thumbnailsRef} className="flex gap-2 overflow-x-auto pb-2 px-8 scroll-smooth scrollbar-hide">
                    {model.images.map((img, index) => (
                        <div key={index} className="w-20 h-20 flex-shrink-0 p-1 pb-2">
                            <button
                                onClick={() => setSelectedImage(index)}
                                className={`w-full h-full relative rounded-lg overflow-hidden ${
                                    index === selectedImage ? "ring-2 ring-offset-2" : "hover:opacity-80"
                                }`}
                            >
                                <img
                                    src={`${BACKEND_BASE_URL}${img}`}
                                    alt={`Preview ${index + 1}`}
                                    className="w-full h-full object-cover"
                                />
                            </button>
                        </div>
                    ))}
                </div>

                <button
                    onClick={() => scrollThumbnails("right")}
                    className="absolute right-0 top-1/2 -translate-y-1/2 bg-black/50 hover:bg-black/70 text-white rounded-full p-1 z-10"
                    aria-label="Scroll thumbnails right"
                >
                    <ChevronRight className="h-4 w-4" />
                </button>
            </div>
        </div>
    );
}

function InfoCard({ model }: { model: DetailedModelResponse }) {
    return (
        <div className="w-full max-w-lg px-1">
            <div className="flex justify-between items-start mb-6">
                <div className="space-y-2">
                    <h1 className="text-2xl font-bold">{model.title}</h1>
                </div>
                <OptionsDropdownMenu />
            </div>

            <div className="mb-6">
                <div className="space-y-4">
                    <div className="font-medium text-gray-400">{model.author}</div>
                    <div className="flex gap-2">
                        <Button variant="outline" size="sm" className="h-8">
                            Printables
                        </Button>
                        <Button variant="outline" size="sm" className="h-8">
                            Thingiverse
                        </Button>
                        <Button variant="outline" size="sm" className="h-8">
                            Thangs
                        </Button>
                    </div>
                </div>
            </div>

            <div className="space-y-3 mb-6">
                <Button
                    size="lg"
                    className="w-full"
                    onClick={() => (window.location.href = BACKEND_BASE_URL + "/api/download/" + model.package_name)}
                >
                    <Download className="mr-2 h-5 w-5" />
                    Download
                </Button>
                <div className="grid grid-cols-3 gap-2">
                    <Button variant="outline" className="w-full">
                        <Heart className="h-5 w-5" />
                    </Button>
                    <Button variant="outline" className="w-full">
                        <RefreshCcw className="h-5 w-5" />
                    </Button>
                    <Button variant="outline" className="w-full">
                        <Bookmark className="h-5 w-5" />
                    </Button>
                </div>
            </div>
            <div className="space-y-2">
                <div>
                    <span className="font-bold">License:</span> {model.license}
                </div>
                <div>
                    <span className="font-bold">Price:</span> $49.99
                </div>
                <div>
                    <span className="font-bold">Origin URL:</span>
                    <a href={model.origin} className="text-blue-500 hover:underline ml-1">
                        {model.origin}
                    </a>
                </div>
                <div>
                    <span className="font-bold">Paid:</span> Yes
                </div>
            </div>
        </div>
    );
}

function Description({ model }: { model: DetailedModelResponse }) {
    return (
        <div className="max-w-6xl mx-auto p-6">
            <div className="prose max-w-none">
                <h2 className="text-xl font-bold mb-4">Description</h2>
                <p className="mb-4">{model.title}</p>
            </div>
        </div>
    );
}

function FileList({ model }: { model: DetailedModelResponse }) {
    const files = model.files;

    return (
        <div className="max-w-6xl mx-auto p-6">
            <div className="mb-6 flex items-center justify-between">
                <h2 className="text-xl font-bold">Model Files</h2>
                <Button
                    variant="outline"
                    className="flex items-center gap-2"
                    onClick={() => (window.location.href = BACKEND_BASE_URL + "/api/download/" + model.package_name)}
                >
                    <Download size={16} />
                    All Files (483 KB)
                </Button>
            </div>

            <div className="space-y-4">
                {files.map((file, index) => (
                    <Card key={index} className="p-4">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-4">
                                <img src={BACKEND_BASE_URL + file.preview_image} className="h-24" />
                                <div>
                                    <h3 className="font-medium">{file.file_path}</h3>
                                    <p className="text-sm text-gray-500">
                                        {"2 Mb"} | {String(file.date_added) || ""} | {file.file_hash || ""}
                                    </p>
                                </div>
                            </div>

                            <div className="flex gap-2">
                                <Button
                                    variant="outline"
                                    className="flex items-center gap-2"
                                    onClick={() => {
                                        saveAs(BACKEND_BASE_URL + file.file_path, file.file_path.split("/").pop());
                                    }}
                                >
                                    <Download size={16} />
                                    Download
                                </Button>
                            </div>
                        </div>
                    </Card>
                ))}
            </div>
        </div>
    );
}

function Model() {
    const { slug } = useParams();

    const [model, setModel] = useState<DetailedModelResponse>();

    async function getModels() {
        fetch(BACKEND_BASE_URL + `/api/model/${slug}`, {
            method: "GET",
        })
            .then((response) => {
                if (!response.ok) {
                    throw new Error("Network response was not ok");
                }
                return response.json();
            })
            .then((response_models: DetailedModelResponse) => {
                setModel(response_models);
            })
            .catch((error) => {
                console.error("Fetch error:", error);
            });
    }

    useEffect(() => {
        getModels();
    }, [slug]);

    return (
        <>
            {model && (
                <div className="min-h-screen">
                    <div className="flex flex-col lg:flex-row gap-6 max-w-8xl mx-auto p-6">
                        <div className="w-full lg:w-3/5">
                            <ImageGallery model={model} />
                        </div>
                        <div className="w-full lg:w-2/5">
                            <InfoCard model={model} />
                        </div>
                    </div>
                    <Description model={model} />
                    <FileList model={model} />
                </div>
            )}
        </>
    );
}

export default Model;
