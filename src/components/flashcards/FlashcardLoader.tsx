export interface FlashcardLoaderProps {
  text?: string;
}

const FlashcardLoader = ({ text = 'Loading…' }: FlashcardLoaderProps) => {
  return (
    <div className="flex items-center justify-center p-6">
      <div className="flex items-center gap-3 text-sm opacity-80">
        <div className="w-4 h-4 border-2 border-primary-sky-blue border-t-transparent rounded-full animate-spin" />
        <span>{text}</span>
      </div>
    </div>
  );
};

export default FlashcardLoader;
