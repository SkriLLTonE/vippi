import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBody, ApiConsumes, ApiProduces, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import {
  AssignLeadSchema,
  ChangeStatusSchema,
  CommentSchema,
  CreateLeadSchema,
  CSV_MAX_BYTES,
  FirstContactSchema,
  LeadExportQuerySchema,
  LeadListQuerySchema,
  OverdueQuerySchema,
  UpdateLeadSchema,
  type AssignLeadRequest,
  type ChangeStatusRequest,
  type CommentRequest,
  type CreateLeadRequest,
  type FirstContactRequest,
  type LeadExportQuery,
  type LeadListQuery,
  type OverdueQuery,
  type UpdateLeadRequest,
} from '@vippi/shared';
import type { Actor } from '../../common/actor.js';
import { AppException } from '../../common/app-exception.js';
import { CurrentActor, RequireFeature, RequirePermission } from '../../common/decorators.js';
import { UuidParam } from '../../common/params.js';
import { RequestMeta, type ReqMeta } from '../../common/req-meta.js';
import { ApiZodBody, ApiZodQuery, ZodPipe } from '../../common/zod.js';
import { CSV_ENCODING_MESSAGE } from './domain/csv-import.js';
import { LeadsExportService } from './leads-export.service.js';
import { LeadsImportService } from './leads-import.service.js';
import { LeadsService } from './leads.service.js';

interface UploadedCsv {
  buffer: Buffer;
  originalname: string;
  mimetype: string;
  size: number;
}

const CSV_MIME = new Set(['text/csv', 'application/vnd.ms-excel', 'text/plain', 'application/csv', 'application/octet-stream']);

function requireCsv(file: UploadedCsv | undefined): Buffer {
  if (!file) {
    throw new AppException(400, 'CSV_INVALID', 'File is required', [
      { path: 'file', code: 'required', message: 'File is required' },
    ]);
  }
  if (!file.originalname.toLowerCase().endsWith('.csv') || !CSV_MIME.has(file.mimetype)) {
    throw new AppException(415, 'UNSUPPORTED_FILE', CSV_ENCODING_MESSAGE);
  }
  return file.buffer;
}

const csvUpload = () =>
  UseInterceptors(FileInterceptor('file', { limits: { fileSize: CSV_MAX_BYTES, files: 1, fields: 0 } }));

const fileBody = () =>
  ApiBody({ schema: { type: 'object', properties: { file: { type: 'string', format: 'binary' } }, required: ['file'] } });

@ApiTags('leads')
@Controller('leads')
export class LeadsController {
  constructor(
    private readonly leads: LeadsService,
    private readonly importer: LeadsImportService,
    private readonly exporter: LeadsExportService,
  ) {}

  @Get()
  @RequirePermission('lead.read')
  @ApiZodQuery(LeadListQuerySchema)
  list(@CurrentActor() actor: Actor, @Query(new ZodPipe(LeadListQuerySchema)) q: LeadListQuery) {
    return this.leads.list(actor, q);
  }

  @Post()
  @RequirePermission('lead.create')
  @ApiZodBody(CreateLeadSchema)
  create(@CurrentActor() actor: Actor, @Body(new ZodPipe(CreateLeadSchema)) body: CreateLeadRequest) {
    return this.leads.create(actor, body);
  }

  @Get('overdue')
  @RequirePermission('lead.read')
  @ApiZodQuery(OverdueQuerySchema)
  overdue(@CurrentActor() actor: Actor, @Query(new ZodPipe(OverdueQuerySchema)) q: OverdueQuery) {
    return this.leads.overdue(actor, q);
  }

  @Get('export.csv')
  @RequirePermission('lead.export')
  @ApiProduces('text/csv')
  @ApiZodQuery(LeadExportQuerySchema)
  async exportCsv(
    @CurrentActor() actor: Actor,
    @Query(new ZodPipe(LeadExportQuerySchema)) q: LeadExportQuery,
    @RequestMeta() meta: ReqMeta,
    @Res() res: Response,
  ): Promise<void> {
    const { filename, body } = await this.exporter.export(actor, q, meta);
    res
      .status(200)
      .setHeader('Content-Type', 'text/csv; charset=utf-8')
      .setHeader('Content-Disposition', `attachment; filename="${filename}"`)
      .setHeader('Cache-Control', 'no-store')
      .send(body);
  }

  @Get('import/template')
  @RequirePermission('lead.import')
  @ApiProduces('text/csv')
  template(@Res() res: Response): void {
    res
      .status(200)
      .setHeader('Content-Type', 'text/csv; charset=utf-8')
      .setHeader('Content-Disposition', 'attachment; filename="vippi-leads-template.csv"')
      .send(this.importer.template());
  }

  @Post('import/preview')
  @HttpCode(200)
  @RequirePermission('lead.import')
  @RequireFeature('CSV_IMPORT_PREVIEW')
  @ApiConsumes('multipart/form-data')
  @fileBody()
  @csvUpload()
  preview(@CurrentActor() actor: Actor, @UploadedFile() file: UploadedCsv | undefined) {
    return this.importer.preview(actor, requireCsv(file));
  }

  @Post('import')
  @HttpCode(200)
  @RequirePermission('lead.import')
  @ApiConsumes('multipart/form-data')
  @fileBody()
  @csvUpload()
  import(
    @CurrentActor() actor: Actor,
    @UploadedFile() file: UploadedCsv | undefined,
    @RequestMeta() meta: ReqMeta,
  ) {
    return this.importer.import(actor, requireCsv(file), meta);
  }

  @Get(':id')
  @RequirePermission('lead.read')
  get(@CurrentActor() actor: Actor, @Param('id', UuidParam) id: string) {
    return this.leads.getDto(actor, id);
  }

  @Patch(':id')
  @RequirePermission('lead.read')
  @ApiZodBody(UpdateLeadSchema)
  update(
    @CurrentActor() actor: Actor,
    @Param('id', UuidParam) id: string,
    @Body(new ZodPipe(UpdateLeadSchema)) body: UpdateLeadRequest,
  ) {
    return this.leads.update(actor, id, body);
  }

  @Delete(':id')
  @HttpCode(204)
  @RequirePermission('lead.delete')
  async remove(@CurrentActor() actor: Actor, @Param('id', UuidParam) id: string, @RequestMeta() meta: ReqMeta) {
    await this.leads.softDelete(actor, id, meta);
  }

  @Post(':id/assign')
  @HttpCode(200)
  @RequirePermission('lead.assign')
  @ApiZodBody(AssignLeadSchema)
  assign(
    @CurrentActor() actor: Actor,
    @Param('id', UuidParam) id: string,
    @Body(new ZodPipe(AssignLeadSchema)) body: AssignLeadRequest,
    @RequestMeta() meta: ReqMeta,
  ) {
    return this.leads.assign(actor, id, body.assigneeId, meta);
  }

  @Post(':id/take')
  @HttpCode(200)
  @RequirePermission('lead.take')
  take(@CurrentActor() actor: Actor, @Param('id', UuidParam) id: string) {
    return this.leads.take(actor, id);
  }

  @Post(':id/first-contact')
  @HttpCode(200)
  @RequirePermission('lead.read')
  @ApiZodBody(FirstContactSchema)
  firstContact(
    @CurrentActor() actor: Actor,
    @Param('id', UuidParam) id: string,
    @Body(new ZodPipe(FirstContactSchema)) body: FirstContactRequest,
  ) {
    return this.leads.firstContact(actor, id, body);
  }

  @Post(':id/status')
  @HttpCode(200)
  @RequirePermission('lead.read')
  @ApiZodBody(ChangeStatusSchema)
  changeStatus(
    @CurrentActor() actor: Actor,
    @Param('id', UuidParam) id: string,
    @Body(new ZodPipe(ChangeStatusSchema)) body: ChangeStatusRequest,
  ) {
    return this.leads.changeStatus(actor, id, body);
  }

  @Get(':id/activities')
  @RequirePermission('lead.read')
  activities(@CurrentActor() actor: Actor, @Param('id', UuidParam) id: string) {
    return this.leads.activities(actor, id);
  }

  @Post(':id/comments')
  @RequirePermission('lead.read')
  @ApiZodBody(CommentSchema)
  comment(
    @CurrentActor() actor: Actor,
    @Param('id', UuidParam) id: string,
    @Body(new ZodPipe(CommentSchema)) body: CommentRequest,
  ) {
    return this.leads.addComment(actor, id, body);
  }
}
