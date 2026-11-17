import { Throttle } from '@nestjs/throttler';
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Post,
  Redirect,
} from '@nestjs/common';
import {
  ApiAcceptedResponse,
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiTags,
  ApiResponse,
  ApiNoContentResponse,
} from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { JwtPayload } from '../auth/auth.types';
import { VideosService } from './videos.service';
import { CreateVideoDto } from './dto/create-video.dto';
import {
  VideoResponseDto,
  UploadResponseDto,
  SignedPartDto,
} from './dto/video-response.dto';

@ApiTags('videos')
@ApiBearerAuth('access-token')
@Throttle({ default: { limit: 120, ttl: 60000 } })
@ApiResponse({ status: 401, description: 'JWT ausente ou inválido' })
@ApiResponse({
  status: 404,
  description: 'Vídeo não encontrado ou pertence a outro usuário',
})
@ApiResponse({ status: 409, description: 'Estado incompatível com a operação' })
@ApiResponse({ status: 400, description: 'Parâmetros ou partes inválidos' })
@ApiResponse({
  status: 503,
  description: 'Armazenamento indisponível; operação pode ser repetida',
})
@Controller('videos')
export class VideosController {
  constructor(private readonly videos: VideosService) {}
  @Post()
  @ApiCreatedResponse({ type: VideoResponseDto })
  create(@CurrentUser() user: JwtPayload, @Body() dto: CreateVideoDto) {
    return this.videos.create(user.sub, dto);
  }
  @Get(':id')
  @ApiOkResponse({ type: VideoResponseDto })
  get(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: JwtPayload) {
    return this.videos.get(id, user.sub);
  }
  @Get(':id/upload')
  @ApiOkResponse({ type: UploadResponseDto })
  upload(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.videos.upload(id, user.sub);
  }
  @Post(':id/parts/:partNumber')
  @ApiOkResponse({ type: SignedPartDto })
  @HttpCode(200)
  part(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('partNumber', ParseIntPipe) number: number,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.videos.signPart(id, user.sub, number);
  }
  @Post(':id/complete')
  @HttpCode(202)
  @ApiAcceptedResponse({ type: VideoResponseDto })
  complete(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.videos.complete(id, user.sub);
  }
  @Delete(':id/upload')
  @HttpCode(204)
  @ApiNoContentResponse()
  cancel(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.videos.cancel(id, user.sub);
  }
  @Post(':id/retry')
  @HttpCode(202)
  @ApiAcceptedResponse({ type: VideoResponseDto })
  retry(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.videos.retry(id, user.sub);
  }
  @Get(':id/stream')
  @ApiResponse({
    status: 307,
    description:
      'Redirect temporário para objeto privado; destino suporta Range/206',
    headers: { Location: { schema: { type: 'string' } } },
  })
  @Redirect()
  stream(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.videos.location(id, user.sub, 'stream');
  }
  @Get(':id/download')
  @ApiResponse({
    status: 307,
    description:
      'Redirect temporário para objeto privado; destino suporta Range/206',
    headers: { Location: { schema: { type: 'string' } } },
  })
  @Redirect()
  download(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.videos.location(id, user.sub, 'download');
  }
  @Get(':id/thumbnail')
  @ApiResponse({
    status: 307,
    description:
      'Redirect temporário para objeto privado; destino suporta Range/206',
    headers: { Location: { schema: { type: 'string' } } },
  })
  @Redirect()
  thumbnail(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.videos.location(id, user.sub, 'thumbnail');
  }
}
