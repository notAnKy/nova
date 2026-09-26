-- Transactional Phase 7 schema, RLS, search, and activity checks. No files persist.
begin;
insert into auth.users(id,instance_id,aud,role,email,encrypted_password,email_confirmed_at) values
 ('a9a9a9a9-aaaa-4aaa-8aaa-aaaaaaaaaaa1','00000000-0000-0000-0000-000000000000','authenticated','authenticated','phase7-a@example.invalid','',now()),
 ('b9b9b9b9-bbbb-4bbb-8bbb-bbbbbbbbbbb2','00000000-0000-0000-0000-000000000000','authenticated','authenticated','phase7-b@example.invalid','',now()),
 ('c9c9c9c9-cccc-4ccc-8ccc-ccccccccccc3','00000000-0000-0000-0000-000000000000','authenticated','authenticated','phase7-c@example.invalid','',now()),
 ('d9d9d9d9-dddd-4ddd-8ddd-ddddddddddd4','00000000-0000-0000-0000-000000000000','authenticated','authenticated','phase7-d@example.invalid','',now());
set local role authenticated;
select set_config('request.jwt.claim.sub','a9a9a9a9-aaaa-4aaa-8aaa-aaaaaaaaaaa1',true);
select set_config('p7.workspace',public.create_workspace('Phase 7 checks','phase7-checks')->>'id',true);
select set_config('p7.public',public.create_channel(current_setting('p7.workspace')::uuid,'General','general','', 'public_channel')->>'id',true);
select set_config('p7.private',public.create_channel(current_setting('p7.workspace')::uuid,'Secret','secret','', 'private_channel')->>'id',true);
select set_config('p7.invite_b',public.create_workspace_invitation(current_setting('p7.workspace')::uuid,'member',24,1)->>'token',true);
select set_config('p7.invite_c',public.create_workspace_invitation(current_setting('p7.workspace')::uuid,'admin',24,1)->>'token',true);
select set_config('p7.invite_d',public.create_workspace_invitation(current_setting('p7.workspace')::uuid,'member',24,1)->>'token',true);
select set_config('request.jwt.claim.sub','b9b9b9b9-bbbb-4bbb-8bbb-bbbbbbbbbbb2',true);
select public.accept_workspace_invitation(current_setting('p7.invite_b'));
select set_config('request.jwt.claim.sub','c9c9c9c9-cccc-4ccc-8ccc-ccccccccccc3',true);
select public.accept_workspace_invitation(current_setting('p7.invite_c'));
select set_config('request.jwt.claim.sub','d9d9d9d9-dddd-4ddd-8ddd-ddddddddddd4',true);
select public.accept_workspace_invitation(current_setting('p7.invite_d'));
select set_config('request.jwt.claim.sub','a9a9a9a9-aaaa-4aaa-8aaa-aaaaaaaaaaa1',true);
select public.add_private_channel_member(current_setting('p7.private')::uuid,'b9b9b9b9-bbbb-4bbb-8bbb-bbbbbbbbbbb2'::uuid);
select set_config('p7.dm',public.create_or_get_direct(current_setting('p7.workspace')::uuid,
  'b9b9b9b9-bbbb-4bbb-8bbb-bbbbbbbbbbb2'::uuid)->>'id',true);
with m as (insert into public.messages(conversation_id,body) values
 (current_setting('p7.public')::uuid,'Public galaxy @[b9b9b9b9-bbbb-4bbb-8bbb-bbbbbbbbbbb2]') returning id)
select set_config('p7.public_msg',id::text,true) from m;
with m as (insert into public.messages(conversation_id,body) values
 (current_setting('p7.private')::uuid,'Secret nebula') returning id)
select set_config('p7.private_msg',id::text,true) from m;
with m as (insert into public.messages(conversation_id,body) values
 (current_setting('p7.dm')::uuid,'Direct quasar') returning id)
select set_config('p7.dm_msg',id::text,true) from m;
select set_config('request.jwt.claim.sub','b9b9b9b9-bbbb-4bbb-8bbb-bbbbbbbbbbb2',true);
with m as (insert into public.messages(conversation_id,parent_message_id,body) values
 (current_setting('p7.public')::uuid,current_setting('p7.public_msg')::uuid,
  'Reply pulsar @[a9a9a9a9-aaaa-4aaa-8aaa-aaaaaaaaaaa1]') returning id)
select set_config('p7.reply',id::text,true) from m;

do $$ begin
 if (select count(*) from public.search_messages(current_setting('p7.workspace')::uuid,'galaxy'))<>1
    or (select count(*) from public.search_messages(current_setting('p7.workspace')::uuid,'nebula'))<>1
    or (select count(*) from public.search_messages(current_setting('p7.workspace')::uuid,'quasar'))<>1
    or (select count(*) from public.search_messages(current_setting('p7.workspace')::uuid,'pulsar'))<>1 then
  raise exception 'authorized search missing public/private/direct/reply'; end if;
 if not exists(select 1 from public.notifications where recipient_id=auth.uid()
   and message_id=current_setting('p7.public_msg')::uuid and kind='mention') then
  raise exception 'mention notification missing'; end if;
 if exists(select 1 from public.notifications where actor_id=auth.uid()
   and message_id=current_setting('p7.reply')::uuid) then
  raise exception 'actor received own notification'; end if;
end $$;
select set_config('request.jwt.claim.sub','a9a9a9a9-aaaa-4aaa-8aaa-aaaaaaaaaaa1',true);
do $$ begin
 if not exists(select 1 from public.notifications where recipient_id=auth.uid()
   and message_id=current_setting('p7.reply')::uuid and kind='thread_reply') or
    not exists(select 1 from public.notifications where recipient_id=auth.uid()
   and message_id=current_setting('p7.reply')::uuid and kind='mention') then
  raise exception 'thread reply or mention activity missing'; end if;
end $$;
select set_config('p7.attachment',public.reserve_attachment(current_setting('p7.private_msg')::uuid,
 'eeeeeeee-1111-4111-8111-111111111111'::uuid,'report.pdf','application/pdf',1024)::text,true);
select set_config('p7.dm_attachment',public.reserve_attachment(current_setting('p7.dm_msg')::uuid,
 'ffffffff-1111-4111-8111-111111111111'::uuid,'private.txt','text/plain',12)::text,true);
do $$ declare denied boolean:=false; begin
 begin perform public.reserve_attachment(current_setting('p7.private_msg')::uuid,
   gen_random_uuid(),'too-large.pdf','application/pdf',10485761);
 exception when others then denied:=true; end;
 if not denied then raise exception 'oversized attachment reservation accepted'; end if;
 denied:=false;
 begin perform public.reserve_attachment(current_setting('p7.private_msg')::uuid,
   gen_random_uuid(),'malware.exe','application/x-msdownload',1024);
 exception when others then denied:=true; end;
 if not denied then raise exception 'unsupported MIME reservation accepted'; end if;
end $$;
select set_config('p7.path',current_setting('p7.workspace') || '/' ||
  current_setting('p7.private') || '/eeeeeeee-1111-4111-8111-111111111111',true);
select set_config('p7.dm_path',current_setting('p7.workspace') || '/' ||
  current_setting('p7.dm') || '/ffffffff-1111-4111-8111-111111111111',true);
insert into storage.objects(bucket_id,name,owner_id)
values('conversation-attachments',current_setting('p7.path'),
  'a9a9a9a9-aaaa-4aaa-8aaa-aaaaaaaaaaa1'),
 ('conversation-attachments',current_setting('p7.dm_path'),
  'a9a9a9a9-aaaa-4aaa-8aaa-aaaaaaaaaaa1');
do $$ declare denied boolean := false; begin
  begin perform public.finish_attachments(current_setting('p7.private_msg')::uuid);
  exception when insufficient_privilege then denied := true; end;
  if not denied then raise exception 'client bypassed trusted file inspection'; end if;
end $$;
set local role service_role;
select public.begin_attachment_validation(current_setting('p7.private_msg')::uuid,
  'a9a9a9a9-aaaa-4aaa-8aaa-aaaaaaaaaaa1'::uuid);
select public.begin_attachment_validation(current_setting('p7.dm_msg')::uuid,
  'a9a9a9a9-aaaa-4aaa-8aaa-aaaaaaaaaaa1'::uuid);
set local role authenticated;
select set_config('request.jwt.claim.sub','a9a9a9a9-aaaa-4aaa-8aaa-aaaaaaaaaaa1',true);
do $$ begin
 if nova_private.can_use_attachment_object(current_setting('p7.path'),'insert')
    or nova_private.can_use_attachment_object(current_setting('p7.path'),'delete')
    or has_function_privilege('authenticated','public.finalize_validated_attachments(uuid,uuid)','EXECUTE')
    or has_function_privilege('authenticated','public.begin_attachment_validation(uuid,uuid)','EXECUTE') then
   raise exception 'uploader can change frozen bytes or bypass inspection'; end if;
end $$;
set local role service_role;
select public.finalize_validated_attachments(current_setting('p7.private_msg')::uuid,
  'a9a9a9a9-aaaa-4aaa-8aaa-aaaaaaaaaaa1'::uuid);
select public.finalize_validated_attachments(current_setting('p7.dm_msg')::uuid,
  'a9a9a9a9-aaaa-4aaa-8aaa-aaaaaaaaaaa1'::uuid);
reset role;
do $$ begin
 if (select expires_at from public.message_attachments where id=current_setting('p7.attachment')::uuid)
      not between now() + interval '71 hours 59 minutes' and now() + interval '72 hours 1 minute'
    or (select expires_at from public.message_attachments where id=current_setting('p7.dm_attachment')::uuid)
      not between now() + interval '71 hours 59 minutes' and now() + interval '72 hours 1 minute' then
   raise exception 'successful upload did not receive a 72-hour expiry'; end if;
end $$;
set local role authenticated;
select set_config('request.jwt.claim.sub','b9b9b9b9-bbbb-4bbb-8bbb-bbbbbbbbbbb2',true);
do $$ begin
 if (select count(*) from public.message_attachments where id=current_setting('p7.attachment')::uuid)<>1 then
  raise exception 'private member cannot read attachment metadata'; end if;
 if (select uploader_id from public.message_attachments where id=current_setting('p7.attachment')::uuid)
    <> 'a9a9a9a9-aaaa-4aaa-8aaa-aaaaaaaaaaa1'::uuid then
   raise exception 'attachment uploader was spoofed'; end if;
 if not nova_private.can_use_attachment_object((select storage_path from public.message_attachments
   where id=current_setting('p7.attachment')::uuid),'select') then
  raise exception 'private member cannot download attachment'; end if;
 if not exists(select 1 from storage.objects where bucket_id='conversation-attachments'
   and name=current_setting('p7.path')) then raise exception 'private member cannot read Storage object'; end if;
 if not exists(select 1 from public.message_attachments where id=current_setting('p7.dm_attachment')::uuid)
   or not exists(select 1 from storage.objects where bucket_id='conversation-attachments'
   and name=current_setting('p7.dm_path')) then raise exception 'DM participant cannot access attachment'; end if;
end $$;
do $$ declare denied boolean:=false; begin
 begin perform public.reserve_attachment(current_setting('p7.private_msg')::uuid,
   gen_random_uuid(),'spoof.txt','text/plain',10);
 exception when others then denied:=true; end;
 if not denied then raise exception 'other member reserved attachment on author message'; end if;
end $$;
update public.notifications set read_at=now() where message_id=current_setting('p7.public_msg')::uuid;
select set_config('p7.notification',(select id::text from public.notifications
  where message_id=current_setting('p7.public_msg')::uuid limit 1),true);
do $$ begin
 if not exists(select 1 from public.notifications where message_id=current_setting('p7.public_msg')::uuid
   and read_at is not null) then raise exception 'recipient could not mark own activity read'; end if;
end $$;
select set_config('request.jwt.claim.sub','c9c9c9c9-cccc-4ccc-8ccc-ccccccccccc3',true);
do $$ declare denied boolean := false; changed_id uuid; begin
 if exists(select 1 from public.search_messages(current_setting('p7.workspace')::uuid,'nebula'))
    or exists(select 1 from public.search_messages(current_setting('p7.workspace')::uuid,'quasar'))
    or exists(select 1 from public.message_attachments where id in
      (current_setting('p7.attachment')::uuid,current_setting('p7.dm_attachment')::uuid))
    or exists(select 1 from public.notifications) then
  raise exception 'workspace admin received private/DM/activity data'; end if;
 if not exists(select 1 from public.search_messages(current_setting('p7.workspace')::uuid,'galaxy')) then
  raise exception 'admin cannot search public messages'; end if;
 if nova_private.can_use_attachment_object(current_setting('p7.path'),'select') then
   raise exception 'DM/private attachment path readable by admin outsider'; end if;
 if exists(select 1 from storage.objects where bucket_id='conversation-attachments'
   and name in (current_setting('p7.path'),current_setting('p7.dm_path'))) then
   raise exception 'admin saw private or DM Storage object'; end if;
 if nova_private.can_use_attachment_object(current_setting('p7.dm_path'),'select') then
   raise exception 'admin can download unrelated DM attachment'; end if;
 update public.notifications set read_at=now()
   where id=current_setting('p7.notification')::uuid returning id into changed_id;
 if changed_id is not null then raise exception 'admin marked another user activity read'; end if;
 begin insert into storage.objects(bucket_id,name,owner_id) values
   ('conversation-attachments',current_setting('p7.workspace') || '/' ||
    current_setting('p7.private') || '/aaaaaaaa-1111-4111-8111-111111111111',auth.uid()::text);
 exception when others then denied := true; end;
 if not denied then raise exception 'unreserved private upload accepted'; end if;
end $$;
select set_config('request.jwt.claim.sub','d9d9d9d9-dddd-4ddd-8ddd-ddddddddddd4',true);
do $$ begin
 if exists(select 1 from public.search_messages(current_setting('p7.workspace')::uuid,'nebula'))
    or exists(select 1 from public.message_attachments where id=current_setting('p7.attachment')::uuid) then
  raise exception 'private outsider received content'; end if;
 if nova_private.can_use_attachment_object(current_setting('p7.path'),'select') then
   raise exception 'guessed attachment path readable by outsider'; end if;
 if exists(select 1 from storage.objects where bucket_id='conversation-attachments'
   and name=current_setting('p7.path')) then raise exception 'outsider saw guessed Storage object'; end if;
end $$;
reset role;
update public.message_attachments set expires_at=now()-interval '1 second'
  where id=current_setting('p7.attachment')::uuid;
set local role authenticated;
select set_config('request.jwt.claim.sub','b9b9b9b9-bbbb-4bbb-8bbb-bbbbbbbbbbb2',true);
do $$ begin
 if not exists(select 1 from public.message_attachments
   where id=current_setting('p7.attachment')::uuid) then
   raise exception 'expired attachment placeholder not readable by participant'; end if;
 if nova_private.can_use_attachment_object(current_setting('p7.path'),'select')
   or exists(select 1 from storage.objects where bucket_id='conversation-attachments'
     and name=current_setting('p7.path')) then
   raise exception 'expired private attachment remains downloadable'; end if;
 if not exists(select 1 from public.messages where id=current_setting('p7.private_msg')::uuid)
   then raise exception 'expiration removed parent message'; end if;
end $$;
select set_config('request.jwt.claim.sub','a9a9a9a9-aaaa-4aaa-8aaa-aaaaaaaaaaa1',true);
do $$ begin
 if nova_private.can_use_attachment_object(current_setting('p7.path'),'select') then
   raise exception 'uploader can download expired attachment'; end if;
end $$;
reset role;
insert into public.message_attachments(message_id,conversation_id,uploader_id,storage_path,
  original_name,mime_type,size_bytes,state,expires_at)
values(current_setting('p7.dm_msg')::uuid,current_setting('p7.dm')::uuid,
  'a9a9a9a9-aaaa-4aaa-8aaa-aaaaaaaaaaa1'::uuid,
  current_setting('p7.workspace') || '/' || current_setting('p7.dm') ||
  '/11111111-1111-4111-8111-111111111111','gone.txt','text/plain',10,'ready',now()-interval '1 hour');
insert into public.message_attachments(message_id,conversation_id,uploader_id,storage_path,
  original_name,mime_type,size_bytes,state,created_at)
values(current_setting('p7.dm_msg')::uuid,current_setting('p7.dm')::uuid,
  'a9a9a9a9-aaaa-4aaa-8aaa-aaaaaaaaaaa1'::uuid,
  current_setting('p7.workspace') || '/' || current_setting('p7.dm') ||
  '/22222222-2222-4222-8222-222222222222','abandoned.txt','text/plain',10,
  'pending',now()-interval '2 hours');
insert into public.message_attachments(message_id,conversation_id,uploader_id,storage_path,
  original_name,mime_type,size_bytes,state,created_at)
values(current_setting('p7.dm_msg')::uuid,current_setting('p7.dm')::uuid,
  'a9a9a9a9-aaaa-4aaa-8aaa-aaaaaaaaaaa1'::uuid,
  current_setting('p7.workspace') || '/' || current_setting('p7.dm') ||
  '/33333333-3333-4333-8333-333333333333','interrupted.txt','text/plain',10,
  'validating',now()-interval '2 hours');
set local role service_role;
do $$ begin
 if not exists(select 1 from public.list_stale_attachments(100)
   where storage_path=current_setting('p7.path')) then
   raise exception 'expired attachment absent from cleanup queue'; end if;
 if not exists(select 1 from public.list_stale_attachments(100)
   where storage_path like '%/22222222-2222-4222-8222-222222222222') then
   raise exception 'abandoned upload absent from cleanup queue'; end if;
 if not exists(select 1 from public.list_stale_attachments(100)
   where storage_path like '%/33333333-3333-4333-8333-333333333333') then
   raise exception 'interrupted inspection absent from cleanup queue'; end if;
 perform public.forget_cleaned_attachment(current_setting('p7.workspace') || '/' ||
   current_setting('p7.dm') || '/11111111-1111-4111-8111-111111111111');
 perform public.forget_cleaned_attachment(current_setting('p7.workspace') || '/' ||
   current_setting('p7.dm') || '/11111111-1111-4111-8111-111111111111');
 perform public.forget_cleaned_attachment(current_setting('p7.workspace') || '/' ||
   current_setting('p7.dm') || '/22222222-2222-4222-8222-222222222222');
 perform public.forget_cleaned_attachment(current_setting('p7.workspace') || '/' ||
   current_setting('p7.dm') || '/33333333-3333-4333-8333-333333333333');
 if (select state from public.message_attachments where storage_path like
     '%/11111111-1111-4111-8111-111111111111') <> 'expired'
   or exists(select 1 from public.message_attachments where storage_path like
     '%/22222222-2222-4222-8222-222222222222')
   or exists(select 1 from public.message_attachments where storage_path like
     '%/33333333-3333-4333-8333-333333333333')
   or exists(select 1 from public.list_stale_attachments(100)
     where storage_path like '%/11111111-1111-4111-8111-111111111111')
   or not exists(select 1 from public.messages where id=current_setting('p7.dm_msg')::uuid) then
   raise exception 'cleanup did not preserve expired metadata and parent message idempotently'; end if;
end $$;
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub','a9a9a9a9-aaaa-4aaa-8aaa-aaaaaaaaaaa1',true);
update public.messages set deleted_at=now() where id=current_setting('p7.private_msg')::uuid;
do $$ begin
 if exists(select 1 from public.message_attachments where id=current_setting('p7.attachment')::uuid) then
  raise exception 'deleted message attachment still visible'; end if;
 if exists(select 1 from public.search_messages(current_setting('p7.workspace')::uuid,'nebula')) then
   raise exception 'deleted message still searchable'; end if;
end $$;
select public.remove_workspace_member(current_setting('p7.workspace')::uuid,
  'b9b9b9b9-bbbb-4bbb-8bbb-bbbbbbbbbbb2'::uuid);
select set_config('request.jwt.claim.sub','b9b9b9b9-bbbb-4bbb-8bbb-bbbbbbbbbbb2',true);
do $$ begin
 if exists(select 1 from public.search_messages(current_setting('p7.workspace')::uuid,'galaxy'))
    or exists(select 1 from public.search_messages(current_setting('p7.workspace')::uuid,'quasar'))
    or exists(select 1 from public.notifications)
    or exists(select 1 from public.message_attachments where id=current_setting('p7.dm_attachment')::uuid)
    or exists(select 1 from storage.objects where bucket_id='conversation-attachments'
      and name=current_setting('p7.dm_path'))
    or nova_private.can_use_attachment_object(current_setting('p7.dm_path'),'select') then
   raise exception 'removed member retained Phase 7 visibility'; end if;
end $$;
reset role;
do $$ begin
 if (select state from public.message_attachments where id=current_setting('p7.attachment')::uuid)<>'deleting'
   then raise exception 'deleted attachment not queued'; end if;
 if has_table_privilege('authenticated','public.message_attachments','INSERT')
   or has_table_privilege('anon','public.message_attachments','SELECT')
   or has_table_privilege('authenticated','public.notifications','INSERT') then
   raise exception 'Phase 7 grants too broad'; end if;
 if (select public from storage.buckets where id='conversation-attachments') then
   raise exception 'attachment bucket is public'; end if;
end $$;
rollback;
