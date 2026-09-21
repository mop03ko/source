import {Preloader} from '@/components/preloader';
// page.tsx нь сервер дээр эрх шалгаж байх хугацаанд хөтөч хоосон цагаан дэлгэц харуулдаг байсныг
// орлоно — Next энэ fallback-ийг шууд стримддэг.
export default function Loading(){return <Preloader/>;}
