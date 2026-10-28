#include <dlfcn.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
typedef struct {const void*Command;int32_t CommandLength;const void*Data;int32_t DataLength;} Request;
typedef struct {void*Data;int32_t DataLength;void*Error;int32_t ErrorLength;} Response;
typedef void(*Run)(Request*,Response*);typedef void(*Free)(Response*);
static int call(Run run,Free release,const char*name,const char*data,const char*out){Request q={name,(int32_t)strlen(name),data,(int32_t)strlen(data)};Response r={0};run(&q,&r);if(r.Error&&r.ErrorLength){fprintf(stderr,"%s ERROR: %.*s\n",name,r.ErrorLength,(char*)r.Error);release(&r);return 1;}if(out){FILE*f=fopen(out,"wb");if(!f){release(&r);return 2;}fwrite(r.Data,1,r.DataLength,f);fclose(f);printf("%s OK bytes=%d\n",name,r.DataLength);}else printf("%s OK %.*s\n",name,r.DataLength,(char*)r.Data);release(&r);return 0;}
int main(int argc,char**argv){if(argc!=4)return 2;void*lib=dlopen(argv[1],RTLD_NOW);if(!lib){fprintf(stderr,"%s\n",dlerror());return 1;}Run run=(Run)dlsym(lib,"execute_command");Free release=(Free)dlsym(lib,"free_response");if(!run||!release)return 2;FILE*f=fopen(argv[2],"rb");if(!f)return 2;fseek(f,0,SEEK_END);long size=ftell(f);rewind(f);char*data=calloc(1,size+1);fread(data,1,size,f);fclose(f);if(call(run,release,"initialize",data,NULL))return 1;free(data);if(call(run,release,"get_model_list","{}",argv[3]))return 1;return 0;}
